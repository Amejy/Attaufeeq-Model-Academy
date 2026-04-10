import { env } from '../config/env.js';
import { lookup } from 'node:dns/promises';
import sendgridMail from '@sendgrid/mail';

let transporterPromise = null;
let sendgridReady = false;

function ensureMailConfig() {
  if (!env.mailEnabled) return;

  if (!env.mailFrom) {
    throw new Error('MAIL_FROM is required when MAIL_ENABLED=true.');
  }

  if (env.mailProvider === 'sendgrid') {
    if (!env.sendgridApiKey) {
      throw new Error('SENDGRID_API_KEY is required when MAIL_PROVIDER=sendgrid.');
    }
    return;
  }

  if (env.mailService) {
    if (!env.mailUser || !env.mailPassword) {
      throw new Error('MAIL_USER and MAIL_PASSWORD are required when MAIL_SERVICE is used.');
    }
    return;
  }

  if (!env.mailHost || !env.mailUser || !env.mailPassword) {
    throw new Error('MAIL_HOST, MAIL_USER, and MAIL_PASSWORD are required when MAIL_ENABLED=true.');
  }
}

async function getTransporter() {
  if (!env.mailEnabled) return null;
  if (env.mailProvider === 'sendgrid') return null;
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const nodemailerModule = await import('nodemailer');
    const nodemailer = nodemailerModule.default;

    let transportConfig;

    if (env.mailHost) {
      const family = Number(env.mailFamily || 0);
      const resolvedHost = family > 0
        ? await lookup(env.mailHost, { family })
        : await lookup(env.mailHost);

      transportConfig = {
        host: resolvedHost.address,
        port: env.mailPort,
        secure: env.mailSecure,
        servername: env.mailHost,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
        auth: {
          user: env.mailUser,
          pass: env.mailPassword
        }
      };
    } else if (env.mailService) {
      transportConfig = {
        service: env.mailService,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
        auth: {
          user: env.mailUser,
          pass: env.mailPassword
        }
      };
    } else {
      throw new Error('MAIL_HOST or MAIL_SERVICE is required when MAIL_ENABLED=true.');
    }

    return nodemailer.createTransport(transportConfig);
  })().catch((error) => {
    transporterPromise = null;
    throw new Error(`SMTP connection failed: ${error.message || error}`);
  });

  return transporterPromise;
}

function resolveFromAddress() {
  return env.mailFromName
    ? `"${env.mailFromName}" <${env.mailFrom}>`
    : env.mailFrom;
}

function ensureSendgridReady() {
  if (sendgridReady) return;
  sendgridMail.setApiKey(env.sendgridApiKey);
  sendgridReady = true;
}

async function sendWithSendgrid({ recipientEmail, subject, text, html }) {
  ensureSendgridReady();
  const from = resolveFromAddress();

  try {
    const [response] = await sendgridMail.send({
      to: recipientEmail,
      from,
      subject,
      text,
      html
    });

    return {
      status: 'sent',
      messageId: response?.headers?.['x-message-id'] || ''
    };
  } catch (error) {
    const details = error?.response?.body?.errors?.map((item) => item.message).join('; ');
    const message = details || error?.message || 'SendGrid send failed.';
    throw new Error(`SendGrid error: ${message}`);
  }
}

async function sendEmail({ recipientEmail, subject, text, html }) {
  if (!env.mailEnabled) {
    return { status: 'disabled' };
  }

  if (!recipientEmail) {
    return { status: 'skipped', reason: 'missing-recipient-email' };
  }

  ensureMailConfig();
  if (env.mailProvider === 'sendgrid') {
    return sendWithSendgrid({ recipientEmail, subject, text, html });
  }

  const transporter = await getTransporter();
  const from = resolveFromAddress();

  const info = await transporter.sendMail({
    from,
    to: recipientEmail,
    subject,
    text,
    html
  });

  return {
    status: 'sent',
    messageId: info.messageId || ''
  };
}

export async function sendProvisioningEmail({
  recipientName,
  recipientEmail,
  portalEmail,
  temporaryPassword,
  role,
  institution
}) {
  if (!portalEmail || !temporaryPassword) {
    return { status: 'skipped', reason: 'missing-credentials' };
  }

  const schoolName = institution || 'ATTAUFEEQ Model Academy';
  const subject = `${schoolName} Portal Login Details`;

  const text = [
    `Hello ${recipientName || 'User'},`,
    '',
    `Your ${schoolName} ${role} portal account has been created.`,
    `Portal login email: ${portalEmail}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'You will be forced to change this password on your first login.',
    '',
    'Portal access was created by the school administration.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f766e,#f97316);color:white;">
          <p style="margin:0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.85;">Portal Access</p>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Your school login is ready</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;">Hello ${recipientName || 'User'},</p>
          <p style="margin:0 0 20px;">Your <strong>${schoolName}</strong> ${role} portal account has been created by the school administration.</p>
          <div style="display:grid;gap:12px;">
            <div style="border:1px solid #e2e8f0;border-radius:18px;padding:16px;background:#f8fafc;">
              <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#64748b;">Portal email</p>
              <p style="margin:10px 0 0;font-size:18px;font-weight:700;">${portalEmail}</p>
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:18px;padding:16px;background:#f8fafc;">
              <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#64748b;">Temporary password</p>
              <p style="margin:10px 0 0;font-size:18px;font-weight:700;">${temporaryPassword}</p>
            </div>
          </div>
          <p style="margin:20px 0 0;color:#475569;">You will be forced to change this password on your first login.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({ recipientEmail, subject, text, html });
}

export async function sendResetCodeEmail({
  recipientName,
  recipientEmail,
  resetCode,
  institution
}) {
  if (!resetCode) {
    return { status: 'skipped', reason: 'missing-reset-code' };
  }

  const schoolName = institution || 'ATTAUFEEQ Model Academy';
  const subject = `${schoolName} Password Reset Code`;

  const text = [
    `Hello ${recipientName || 'User'},`,
    '',
    `Use the following reset code to set a new password for your ${schoolName} portal account:`,
    resetCode,
    '',
    'This code expires in 15 minutes.',
    '',
    'If you did not request a password reset, ignore this message.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f766e,#f97316);color:white;">
          <p style="margin:0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.85;">Password Reset</p>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Your reset code</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;">Hello ${recipientName || 'User'},</p>
          <p style="margin:0 0 20px;">Use this code to set a new password for your <strong>${schoolName}</strong> portal account.</p>
          <div style="border:1px solid #e2e8f0;border-radius:18px;padding:18px;background:#f8fafc;text-align:center;">
            <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#64748b;">Reset code</p>
            <p style="margin:12px 0 0;font-size:26px;font-weight:700;letter-spacing:0.2em;">${resetCode}</p>
          </div>
          <p style="margin:20px 0 0;color:#475569;">This code expires in 15 minutes.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({ recipientEmail, subject, text, html });
}

export async function sendPasswordResetEmail({
  recipientName,
  recipientEmail,
  portalEmail,
  temporaryPassword,
  role,
  institution
}) {
  if (!portalEmail || !temporaryPassword) {
    return { status: 'skipped', reason: 'missing-credentials' };
  }

  const schoolName = institution || 'ATTAUFEEQ Model Academy';
  const subject = `${schoolName} Password Reset`;

  const text = [
    `Hello ${recipientName || 'User'},`,
    '',
    `Your ${schoolName} ${role} portal password has been reset by the school administration.`,
    `Portal login email: ${portalEmail}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'Sign in with this temporary password and change it immediately.',
    '',
    'If you did not request this reset, contact the school administration.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f766e,#f97316);color:white;">
          <p style="margin:0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.85;">Password Reset</p>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">A new temporary password was issued</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;">Hello ${recipientName || 'User'},</p>
          <p style="margin:0 0 20px;">The school administration reset your <strong>${schoolName}</strong> ${role} portal password.</p>
          <div style="display:grid;gap:12px;">
            <div style="border:1px solid #e2e8f0;border-radius:18px;padding:16px;background:#f8fafc;">
              <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#64748b;">Portal email</p>
              <p style="margin:10px 0 0;font-size:18px;font-weight:700;">${portalEmail}</p>
            </div>
            <div style="border:1px solid #e2e8f0;border-radius:18px;padding:16px;background:#f8fafc;">
              <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#64748b;">Temporary password</p>
              <p style="margin:10px 0 0;font-size:18px;font-weight:700;">${temporaryPassword}</p>
            </div>
          </div>
          <p style="margin:20px 0 0;color:#475569;">Sign in with this temporary password and change it immediately.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({ recipientEmail, subject, text, html });
}

export async function sendAdminNotificationEmail({
  recipientName,
  recipientEmail,
  title,
  message,
  roleLabel = 'Portal user'
}) {
  if (!title || !message) {
    return { status: 'skipped', reason: 'missing-content' };
  }

  const subject = `ATTAUFEEQ Model Academy Notification: ${title}`;
  const text = [
    `Hello ${recipientName || roleLabel},`,
    '',
    title,
    '',
    message,
    '',
    'This notice was sent from the ATTAUFEEQ Model Academy portal.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f766e,#1d4ed8);color:white;">
          <p style="margin:0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.85;">School Notice</p>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">${title}</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;">Hello ${recipientName || roleLabel},</p>
          <p style="margin:0 0 20px;color:#334155;line-height:1.8;">${message}</p>
          <p style="margin:20px 0 0;color:#64748b;font-size:14px;">This notice was sent from the ATTAUFEEQ Model Academy portal.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({ recipientEmail, subject, text, html });
}
