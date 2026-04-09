import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { query, withTransaction } from '../db/client.js';
import {
  countUsers,
  createUser,
  findUserByEmail,
  listUsersByEmails,
  updateUserPassword
} from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';

const REQUIRED_AUTH_TABLES = [
  'users',
  'refresh_sessions',
  'password_reset_requests',
  'schema_migrations'
];
const AUTH_BOOTSTRAP_LOCK_KEY = 941_217;

const LEGACY_DEMO_EMAILS = [
  'admin@attaufiqschools.com',
  'admissions@attaufiqschools.com',
  'teacher@attaufiqschools.com',
  'student@attaufiqschools.com',
  'parent@attaufiqschools.com'
];

function getExecutor(options = {}) {
  if (options.executor?.query) return options.executor;
  return { query };
}

function isValidBootstrapEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isStrongBootstrapPassword(password) {
  const value = String(password || '');
  return (
    value.length >= 14 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export function validateBootstrapAdminConfig(options = {}) {
  const bootstrapAdminEmail = String(options.bootstrapAdminEmail || env.bootstrapAdminEmail || '').trim().toLowerCase();
  const bootstrapAdminPassword = String(options.bootstrapAdminPassword || env.bootstrapAdminPassword || '');
  const bootstrapAdminFullName = String(options.bootstrapAdminFullName || env.bootstrapAdminFullName || 'System Administrator').trim() || 'System Administrator';

  if (!bootstrapAdminEmail || !bootstrapAdminPassword) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set before replacing the legacy admin.');
  }

  if (!isValidBootstrapEmail(bootstrapAdminEmail)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  }

  if (LEGACY_DEMO_EMAILS.includes(bootstrapAdminEmail)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL cannot reuse a legacy demo email address.');
  }

  if (!isStrongBootstrapPassword(bootstrapAdminPassword)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 14 characters and include upper, lower, number, and symbol characters.');
  }

  return {
    bootstrapAdminEmail,
    bootstrapAdminPassword,
    bootstrapAdminFullName
  };
}

export async function verifyRequiredAuthTables(options = {}) {
  const executor = getExecutor(options);
  const result = await executor.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_name = ANY($1::text[])`,
    [REQUIRED_AUTH_TABLES]
  );

  const existing = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_AUTH_TABLES.filter((name) => !existing.has(name));

  if (missing.length) {
    throw new Error(
      `Database schema is incomplete. Missing required auth tables: ${missing.join(', ')}. Run backend migrations first.`
    );
  }
}

export async function ensureBootstrapAdmin(options = {}) {
  let bootstrapConfig = null;
  try {
    bootstrapConfig = validateBootstrapAdminConfig(options);
  } catch (error) {
    const userCount = await countUsers({ executor: options.executor });
    if (userCount > 0) {
      return { created: false, reason: 'users-exist' };
    }
    throw error;
  }

  const { bootstrapAdminEmail, bootstrapAdminPassword, bootstrapAdminFullName } = bootstrapConfig;

  const transactionRunner = options.executor
    ? (work) => work(options.executor)
    : withTransaction;

  return transactionRunner(async (executor) => {
    await executor.query('SELECT pg_advisory_xact_lock($1)', [AUTH_BOOTSTRAP_LOCK_KEY]);

    const userCount = await countUsers({ executor });
    if (userCount > 0) {
      return { created: false, reason: 'users-exist' };
    }

    const passwordHash = await hashPassword(bootstrapAdminPassword);
    const user = await createUser({
      fullName: bootstrapAdminFullName,
      email: bootstrapAdminEmail,
      passwordHash,
      role: 'admin',
      mustChangePassword: true
    }, { executor });

    console.log(`Bootstrap admin created for ${user.email}. Rotate the password immediately after first login.`);
    return { created: true, userId: user.id, email: user.email };
  });
}

export async function verifyLegacyDemoUsers(options = {}) {
  const matches = await listUsersByEmails(LEGACY_DEMO_EMAILS, { executor: options.executor });
  if (!matches.length) return;

  const emails = matches.map((user) => user.email).sort().join(', ');
  if (env.isProduction) {
    throw new Error(`Legacy demo accounts exist in production: ${emails}. Remove or rotate them before startup.`);
  }

  console.warn(`Legacy demo accounts detected: ${emails}`);
}

export async function cleanupLegacyDemoUsers(options = {}) {
  const transactionRunner = options.executor
    ? (work) => work(options.executor)
    : withTransaction;
  const dryRun = Boolean(options.dryRun);

  return transactionRunner(async (executor) => {
    const matches = await listUsersByEmails(LEGACY_DEMO_EMAILS, { executor });
    if (!matches.length) {
      return { replacementAdminCreated: false, deleted: [], disabled: [] };
    }

    let bootstrapConfig = null;
    try {
      bootstrapConfig = validateBootstrapAdminConfig(options);
    } catch {
      bootstrapConfig = null;
    }
    const bootstrapAdminEmail = bootstrapConfig?.bootstrapAdminEmail || '';
    const bootstrapAdminPassword = bootstrapConfig?.bootstrapAdminPassword || '';
    const bootstrapAdminFullName = bootstrapConfig?.bootstrapAdminFullName || 'System Administrator';

    const legacyIds = matches.map((user) => user.id);
    const roleCounts = await executor.query(
      `SELECT
         user_id,
         'teacher' AS source
       FROM teachers
       WHERE user_id = ANY($1::text[])
       UNION ALL
       SELECT user_id, 'student'
       FROM students
       WHERE user_id = ANY($1::text[])
       UNION ALL
       SELECT parent_user_id AS user_id, 'parent'
       FROM students
       WHERE parent_user_id = ANY($1::text[])`,
      [legacyIds]
    );
    const referencedIds = new Set(roleCounts.rows.map((row) => row.user_id));

    let replacementAdminCreated = false;
    const existingNonLegacyAdmin = await executor.query(
      `SELECT 1
       FROM users
       WHERE role = 'admin'
         AND lower(email) <> ALL($1::text[])
       LIMIT 1`,
      [LEGACY_DEMO_EMAILS]
    );
    const hasNonLegacyAdmin = existingNonLegacyAdmin.rowCount > 0;

    const hasLegacyAdmin = matches.some((user) => user.role === 'admin');
    if (hasLegacyAdmin && !hasNonLegacyAdmin && bootstrapAdminEmail && bootstrapAdminPassword) {
      const existingBootstrapAdmin = await findUserByEmail(bootstrapAdminEmail, { executor });
      if (!existingBootstrapAdmin) {
        if (!dryRun) {
          const passwordHash = await hashPassword(bootstrapAdminPassword);
          await createUser({
            fullName: bootstrapAdminFullName,
            email: bootstrapAdminEmail,
            passwordHash,
            role: 'admin',
            mustChangePassword: true
          }, { executor });
        }
        replacementAdminCreated = true;
      }
    }

    const deleted = [];
    const disabled = [];
    const skipped = [];

    for (const user of matches) {
      if (user.role === 'admin' && !hasNonLegacyAdmin && !replacementAdminCreated) {
        skipped.push({
          email: user.email,
          reason: 'bootstrap-admin-required-before-deleting-legacy-admin'
        });
        continue;
      }

      if (!referencedIds.has(user.id)) {
        if (!dryRun) {
          await executor.query('DELETE FROM users WHERE id = $1', [user.id]);
        }
        deleted.push(user.email);
        continue;
      }

      const disabledEmail = `disabled+legacy-${user.role}-${user.id.slice(-8)}@invalid.local`;
      if (!dryRun) {
        const disabledPasswordHash = await hashPassword(`${crypto.randomUUID()}${crypto.randomUUID()}`);
        await executor.query(
          `UPDATE users
           SET email = $2,
               password_hash = $3,
               must_change_password = TRUE
           WHERE id = $1`,
          [user.id, disabledEmail, disabledPasswordHash]
        );
      }
      disabled.push({ from: user.email, to: disabledEmail });
    }

    return { dryRun, replacementAdminCreated, deleted, disabled, skipped };
  });
}

export async function replaceLegacyAdminWithBootstrap(options = {}) {
  const {
    bootstrapAdminEmail,
    bootstrapAdminPassword,
    bootstrapAdminFullName
  } = validateBootstrapAdminConfig(options);

  return withTransaction(async (executor) => {
    await executor.query('SELECT pg_advisory_xact_lock($1)', [AUTH_BOOTSTRAP_LOCK_KEY]);

    let bootstrapAdmin = await findUserByEmail(bootstrapAdminEmail, { executor });
    let created = false;

    if (!bootstrapAdmin) {
      const passwordHash = await hashPassword(bootstrapAdminPassword);
      const newAdmin = await createUser({
        fullName: bootstrapAdminFullName,
        email: bootstrapAdminEmail,
        passwordHash,
        role: 'admin',
        mustChangePassword: true
      }, { executor });
      bootstrapAdmin = await findUserByEmail(newAdmin.email, { executor });
      created = true;
    }

    if (!bootstrapAdmin || bootstrapAdmin.role !== 'admin') {
      throw new Error('Bootstrap admin creation could not be verified. Aborting legacy admin removal.');
    }

    let passwordVerified = await verifyPassword(bootstrapAdminPassword, bootstrapAdmin.passwordHash);
    if (!passwordVerified) {
      const passwordHash = await hashPassword(bootstrapAdminPassword);
      await updateUserPassword(bootstrapAdmin.id, {
        passwordHash,
        mustChangePassword: true
      }, { executor });
      bootstrapAdmin = await findUserByEmail(bootstrapAdminEmail, { executor });
      passwordVerified = Boolean(bootstrapAdmin) && await verifyPassword(bootstrapAdminPassword, bootstrapAdmin.passwordHash);
    }

    if (!passwordVerified || !bootstrapAdmin) {
      throw new Error('Bootstrap admin password verification failed. Aborting legacy admin removal.');
    }

    const legacyAdmin = await findUserByEmail('admin@attaufiqschools.com', { executor });
    if (!legacyAdmin) {
      return {
        created,
        removedLegacyAdmin: false,
        reason: 'legacy-admin-already-removed',
        bootstrapAdmin: {
          id: bootstrapAdmin.id,
          email: bootstrapAdmin.email,
          role: bootstrapAdmin.role,
          mustChangePassword: Boolean(bootstrapAdmin.mustChangePassword)
        }
      };
    }

    const otherAdmins = await executor.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE role = 'admin'
         AND id <> $1`,
      [legacyAdmin.id]
    );

    if (Number(otherAdmins.rows[0]?.count || 0) < 1) {
      throw new Error('No replacement admin exists. Aborting legacy admin removal.');
    }

    await executor.query('DELETE FROM users WHERE id = $1', [legacyAdmin.id]);

    const deletedCheck = await findUserByEmail('admin@attaufiqschools.com', { executor });
    if (deletedCheck) {
      throw new Error('Legacy admin still exists after deletion attempt.');
    }

    return {
      created,
      removedLegacyAdmin: true,
      bootstrapAdmin: {
        id: bootstrapAdmin.id,
        email: bootstrapAdmin.email,
        role: bootstrapAdmin.role,
        mustChangePassword: Boolean(bootstrapAdmin.mustChangePassword)
      }
    };
  });
}
