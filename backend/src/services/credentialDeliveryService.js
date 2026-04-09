import { env } from '../config/env.js';
import {
  claimMailOutboxBatch,
  enqueueMailOutbox,
  markMailOutboxFailure,
  markMailOutboxProcessed
} from '../repositories/mailOutboxRepository.js';
import { sendProvisioningEmail, sendResetCodeEmail } from '../utils/mailer.js';

function decorateCredential(credential, status, message = '', outboxId = '') {
  return {
    ...credential,
    emailDeliveryStatus: status,
    emailDeliveryMessage: message,
    emailDeliveryOutboxId: outboxId || ''
  };
}

export async function deliverProvisioningCredentials(credentials = [], institution = '') {
  const delivered = [];

  for (const credential of credentials) {
    if (!credential) continue;

    if (credential.reused || !credential.password) {
      delivered.push(
        decorateCredential(
          credential,
          credential.reused ? 'reused' : 'not-required',
          credential.reused ? 'Existing account was linked.' : 'No new password was generated.'
        )
      );
      continue;
    }

    if (!credential.recipientEmail) {
      if (env.mailEnabled) {
        throw new Error(`A real email address is required to deliver ${credential.label}.`);
      }

      delivered.push(
        decorateCredential(
          credential,
          'manual-only',
          'SMTP is disabled or no delivery email was provided.'
        )
      );
      continue;
    }

    const delivery = await sendProvisioningEmail({
      recipientName: credential.recipientName,
      recipientEmail: credential.recipientEmail,
      portalEmail: credential.email,
      temporaryPassword: credential.password,
      role: credential.role,
      institution
    });

    delivered.push(
      decorateCredential(
        credential,
        delivery.status,
        delivery.messageId || delivery.reason || ''
      )
    );
  }

  return delivered;
}

export async function queueProvisioningCredentials(credentials = [], institution = '', options = {}) {
  if (!env.useDatabase || options.forceInlineDelivery) {
    return deliverProvisioningCredentials(credentials, institution);
  }

  const queuedJobs = [];
  const deliveryPlan = [];

  for (const credential of credentials) {
    if (!credential) continue;

    if (credential.reused || !credential.password) {
      deliveryPlan.push(
        decorateCredential(
          credential,
          credential.reused ? 'reused' : 'not-required',
          credential.reused ? 'Existing account was linked.' : 'No new password was generated.'
        )
      );
      continue;
    }

    if (!credential.recipientEmail) {
      if (env.mailEnabled) {
        throw new Error(`A real email address is required to deliver ${credential.label}.`);
      }

      deliveryPlan.push(
        decorateCredential(
          credential,
          'manual-only',
          'SMTP is disabled or no delivery email was provided.'
        )
      );
      continue;
    }

    if (!env.mailEnabled) {
      deliveryPlan.push(decorateCredential(credential, 'disabled', 'MAIL_ENABLED is false.'));
      continue;
    }

    queuedJobs.push({
      kind: 'provisioning-credential',
      payload: {
        recipientName: credential.recipientName,
        recipientEmail: credential.recipientEmail,
        portalEmail: credential.email,
        temporaryPassword: credential.password,
        role: credential.role,
        institution,
        label: credential.label
      }
    });

    deliveryPlan.push(credential);
  }

  const persistedJobs = await enqueueMailOutbox(queuedJobs, options);
  let queuedIndex = 0;

  return deliveryPlan.map((item) => {
    if (item.emailDeliveryStatus) return item;

    const job = persistedJobs[queuedIndex];
    queuedIndex += 1;
    return decorateCredential(
      item,
      'queued',
      'Queued for background delivery.',
      job?.id || ''
    );
  });
}

export async function queuePasswordResetCodeDelivery({
  recipientName,
  recipientEmail,
  resetCode,
  institution
} = {}, options = {}) {
  if (!resetCode) {
    return { status: 'skipped', reason: 'missing-reset-code' };
  }

  if (!recipientEmail) {
    return { status: 'skipped', reason: 'missing-recipient-email' };
  }

  if (!env.mailEnabled) {
    return { status: 'disabled', reason: 'MAIL_ENABLED is false.' };
  }

  if (!env.useDatabase || options.forceInlineDelivery) {
    return sendResetCodeEmail({
      recipientName,
      recipientEmail,
      resetCode,
      institution
    });
  }

  const [job] = await enqueueMailOutbox([
    {
      kind: 'password-reset-code',
      payload: {
        recipientName,
        recipientEmail,
        resetCode,
        institution
      }
    }
  ], options);

  return {
    status: 'queued',
    outboxId: job?.id || ''
  };
}

export function summarizeCredentialDelivery(credentials = []) {
  const summary = {
    status: 'pending',
    sentCount: 0,
    queuedCount: 0,
    manualCount: 0,
    skippedCount: 0,
    disabledCount: 0,
    reusedCount: 0,
    notRequiredCount: 0,
    total: 0
  };

  credentials.forEach((credential) => {
    const status = credential?.emailDeliveryStatus || 'pending';
    summary.total += 1;
    if (status === 'sent') summary.sentCount += 1;
    else if (status === 'queued') summary.queuedCount += 1;
    else if (status === 'manual-only') summary.manualCount += 1;
    else if (status === 'disabled') summary.disabledCount += 1;
    else if (status === 'skipped') summary.skippedCount += 1;
    else if (status === 'reused') summary.reusedCount += 1;
    else if (status === 'not-required') summary.notRequiredCount += 1;
  });

  if (summary.manualCount > 0) {
    summary.status = 'manual-only';
  } else if (summary.disabledCount > 0) {
    summary.status = 'disabled';
  } else if (summary.skippedCount > 0) {
    summary.status = 'skipped';
  } else if (summary.queuedCount > 0) {
    summary.status = 'queued';
  } else if (summary.sentCount > 0 || summary.reusedCount > 0 || summary.notRequiredCount > 0) {
    summary.status = 'sent';
  }

  return summary;
}

export async function processPendingMailOutbox({ limit = 10 } = {}) {
  if (!env.useDatabase) {
    return { claimed: 0, processed: 0, sent: 0, failed: 0 };
  }

  const jobs = await claimMailOutboxBatch({ limit });
  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const payload = job.payload || {};
      let delivery = null;

      if (job.kind === 'provisioning-credential') {
        delivery = await sendProvisioningEmail({
          recipientName: payload.recipientName,
          recipientEmail: payload.recipientEmail,
          portalEmail: payload.portalEmail,
          temporaryPassword: payload.temporaryPassword,
          role: payload.role,
          institution: payload.institution
        });
      } else if (job.kind === 'password-reset-code') {
        delivery = await sendResetCodeEmail({
          recipientName: payload.recipientName,
          recipientEmail: payload.recipientEmail,
          resetCode: payload.resetCode,
          institution: payload.institution
        });
      } else {
        await markMailOutboxProcessed(job.id, {
          status: 'skipped',
          message: `Unsupported mail outbox kind: ${job.kind}`
        });
        continue;
      }

      await markMailOutboxProcessed(job.id, {
        status: delivery.status,
        message: delivery.messageId || delivery.reason || ''
      });

      if (delivery.status === 'sent') sent += 1;
    } catch (error) {
      failed += 1;
      await markMailOutboxFailure(job.id, {
        errorMessage: error.message || String(error)
      });
    }
  }

  return {
    claimed: jobs.length,
    processed: jobs.length,
    sent,
    failed
  };
}

export async function processPendingProvisioningCredentialEmails({ limit = 10 } = {}) {
  return processPendingMailOutbox({ limit });
}
