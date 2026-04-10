import { env } from '../config/env.js';
import { Resend } from 'resend';

let resendClient = null;

function ensureMailConfig() {
  if (!env.mailEnabled) return;

  if (!env.mailFrom) {
    throw new Error('MAIL_FROM is required when MAIL_ENABLED=true.');
  }

  if (!env.resendApiKey) {
    throw new Error('RESEND_API_KEY is required when MAIL_ENABLED=true.');
  }
}

function resolveFromAddress() {
  return env.mailFromName
    ? `"${env.mailFromName}" <${env.mailFrom}>`
    : env.mailFrom;
}

function ensureResendReady() {
  if (resendClient) return;
  resendClient = new Resend(env.resendApiKey);
}

async function sendWithResend({ recipientEmail, subject, text, html }) {
  ensureResendReady();
  const from = resolveFromAddress();

  try {
    const response = await resendClient.emails.send({
      from,
      to: recipientEmail,
      subject,
      text,
      html
    });

    if (response?.id) {
      console.info('Resend email sent', { recipientEmail, messageId: response.id });
    }

    return {
      status: 'sent',
      messageId: response?.id || ''
    };
  } catch (error) {
    const message = error?.message || 'Resend send failed.';
    throw new Error(`Resend error: ${message}`);
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
  return sendWithResend({ recipientEmail, subject, text, html });
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
