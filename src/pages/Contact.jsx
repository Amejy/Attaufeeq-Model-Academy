import { useState } from 'react';
import ErrorState from '../components/ErrorState';
import { useSiteContent } from '../context/SiteContentContext';
import { apiJson } from '../utils/publicApi';

const MAP_EMBED_URL = 'https://www.google.com/maps?q=10.47547,7.43232&output=embed';
const DIRECTIONS_URL = 'https://www.google.com/maps/dir/?api=1&destination=10.47547,7.43232';
const SCHOOL_ADDRESS = 'No. 6, Ahmed Ali Close, Off Zambia Road, Barnawa, Kaduna South, Kaduna State, Nigeria';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function splitPhoneNumbers(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function Contact() {
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const contact = siteContent.contact || {};
  const phoneNumbers = splitPhoneNumbers(branding.phone);
  const [form, setForm] = useState({ fullName: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fullNameError = form.fullName && form.fullName.trim().length < 2 ? 'Enter your full name so we know how to reply.' : '';
  const emailError = form.email && !isValidEmail(form.email) ? 'Email format is incorrect.' : '';
  const messageError = form.message && form.message.trim().length < 10 ? 'Message should be at least 10 characters.' : '';
  const canSubmitMessage =
    form.fullName.trim() &&
    isValidEmail(form.email) &&
    form.message.trim().length >= 10;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmitMessage) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/site-content/contact', {
        method: 'POST',
        body: form
      });
      setSuccess(data.message || contact.successMessage);
      setForm({ fullName: '', email: '', message: '' });
    } catch (err) {
      setError(err.message || 'Unable to send message.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="section-wrap py-14">
      <h1 className="break-words font-heading text-4xl text-primary">{contact.title}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="glass-card min-w-0 overflow-hidden p-6 sm:p-7">
          <h2 className="break-words font-heading text-2xl text-primary">{contact.infoTitle}</h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-700">
            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Contact Us</p>
              <p className="mt-2 text-sm leading-6 text-emerald-950">
                Use the quickest channel below. Phone opens your dialer and email opens your mail app immediately.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Address</p>
              <p className="mt-1 break-words">{branding.address}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Phone</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {phoneNumbers.length ? phoneNumbers.map((phone, index) => (
                  <a
                    key={`${phone}-${index}`}
                    href={`tel:${phone}`}
                    className="interactive-button rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-700 hover:text-primary"
                  >
                    Call {phone}
                  </a>
                )) : (
                  <a
                    href={`tel:${branding.phone || ''}`}
                    className="interactive-button rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-700 hover:text-primary"
                  >
                    Call {branding.phone}
                  </a>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email</p>
              <div className="mt-2">
                <a
                  href={`mailto:${branding.email || ''}`}
                  className="interactive-button inline-flex rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-700 hover:text-primary"
                >
                  Email {branding.email}
                </a>
              </div>
            </div>
          </div>
        </section>
        <section className="glass-card min-w-0 overflow-hidden p-6 sm:p-7">
          <h2 className="break-words font-heading text-2xl text-primary">{contact.formTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{contact.formDescription}</p>
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your Name</span>
              <input
                className={`block w-full min-w-0 rounded-2xl border bg-white/80 px-4 py-3 text-sm text-slate-800 ${fullNameError ? 'border-red-300' : 'border-slate-300'}`}
                placeholder="Your Name"
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
              {fullNameError && <p className="mt-2 text-sm text-red-600">{fullNameError}</p>}
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email Address</span>
              <input
                className={`block w-full min-w-0 rounded-2xl border bg-white/80 px-4 py-3 text-sm text-slate-800 ${emailError ? 'border-red-300' : 'border-slate-300'}`}
                placeholder="Email Address"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your Message</span>
              <textarea
                className={`block min-h-[160px] w-full min-w-0 rounded-2xl border bg-white/80 px-4 py-3 text-sm text-slate-800 ${messageError ? 'border-red-300' : 'border-slate-300'}`}
                rows="5"
                placeholder="Tell us how we can help"
                value={form.message}
                onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                required
              />
              {messageError && <p className="mt-2 text-sm text-red-600">{messageError}</p>}
            </label>
            {error && (
              <ErrorState
                compact
                title="Message not sent"
                message={error}
                onRetry={() => setError('')}
              />
            )}
            {success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
            <button
              type="submit"
              disabled={submitting || !canSubmitMessage}
              className="interactive-button w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70 sm:w-fit"
            >
              {submitting ? 'Sending...' : (contact.submitLabel || 'Send Message')}
            </button>
          </form>
        </section>
      </div>

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-2xl text-primary">Our Location</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">{SCHOOL_ADDRESS}</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
          <iframe
            title="ATTAUFEEQ Model Academy location map"
            src={MAP_EMBED_URL}
            className="block h-[350px] w-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href={DIRECTIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="interactive-button inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            Get Directions
          </a>
        </div>
      </section>
    </main>
  );
}

export default Contact;
