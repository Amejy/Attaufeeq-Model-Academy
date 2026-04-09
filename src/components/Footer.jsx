import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';

function splitPhoneNumbers(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function Footer() {
  const { siteContent } = useSiteContent();
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const branding = siteContent.branding || {};
  const phoneNumbers = splitPhoneNumbers(branding.phone);
  const schoolName = branding.name || 'School';
  const footerHeading = branding.navSubtitle || branding.motto || 'A modern school presence with warmth and structure.';
  const admissionsAvailable = !isLoading && periodOpen;

  return (
    <footer className="section-wrap mt-8 pb-6">
      <div className="gradient-shell overflow-hidden rounded-[28px] px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="grid gap-7 md:grid-cols-[1.05fr,0.95fr,0.95fr]">
          <div>
            <div className="footer-logo-row">
              <img
                src="/images/logo.png"
                alt={`${branding.name || 'School'} logo`}
                className="footer-logo"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">{schoolName}</p>
            </div>
            <h3 className="mt-2 font-heading text-xl">{footerHeading}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/80">{branding.motto}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">Quick Links</h4>
            <div className="mt-3 grid gap-2 text-sm text-white/88">
              {admissionsAvailable ? (
                <Link to="/admissions" className="hover:text-white">Admissions</Link>
              ) : (
                <span className="cursor-default text-white/55">Admissions Closed</span>
              )}
              <Link to="/academics" className="hover:text-white">Academics</Link>
              <Link to="/news" className="hover:text-white">News & Events</Link>
              <Link to="/contact" className="hover:text-white">Contact</Link>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">Contact</h4>
            <div className="mt-3 space-y-2 text-sm text-white/88">
              <p>{branding.address}</p>
              <p>{phoneNumbers.length ? phoneNumbers.join(', ') : branding.phone}</p>
              <p>{branding.email}</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
