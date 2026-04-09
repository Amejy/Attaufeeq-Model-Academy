import { useState } from 'react';
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
      <h1 className="font-heading text-4xl text-primary">{contact.title}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-heading text-2xl text-primary">{contact.infoTitle}</h2>
          <p className="mt-4 text-sm text-slate-700">Address: {branding.address}</p>
          <div className="mt-1 text-sm text-slate-700">
            <span>Phone: </span>
            {phoneNumbers.length ? phoneNumbers.map((phone, index) => (
              <span key={phone}>
                {index > 0 ? ', ' : ''}
                <a href={`tel:${phone}`} className="hover:text-primary">
                  {phone}
                </a>
              </span>
            )) : branding.phone}
          </div>
          <p className="mt-1 text-sm text-slate-700">Email: <a href={`mailto:${branding.email || ''}`} className="hover:text-primary">{branding.email}</a></p>
        </section>
        <section className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-heading text-2xl text-primary">{contact.formTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{contact.formDescription}</p>
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <input
              className="w-full rounded-md border border-slate-300 p-3 text-sm"
              placeholder="Your Name"
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-md border border-slate-300 p-3 text-sm"
              placeholder="Email Address"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <textarea
              className="w-full rounded-md border border-slate-300 p-3 text-sm"
              rows="4"
              placeholder="Your Message"
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-700">{success}</p>}
            <button
              type="submit"
              disabled={submitting || !canSubmitMessage}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
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
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
          >
            Get Directions
          </a>
        </div>
      </section>
    </main>
  );
}

export default Contact;
