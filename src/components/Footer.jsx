import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import SmartImage from './SmartImage';

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
  const brandLogo = branding.logoUrl || '/images/logo.png';
  const phoneNumbers = splitPhoneNumbers(branding.phone);
  const schoolName = branding.name || 'School';
  const footerHeading = branding.navSubtitle || branding.motto || 'A modern school presence with warmth and structure.';
  const admissionsAvailable = !isLoading && periodOpen;

  return (
    <footer className="section-wrap mt-8 pb-5">
      <div className="gradient-shell overflow-hidden rounded-[26px] px-4 py-5 text-white sm:px-6 sm:py-6">
        <div className="grid gap-5 md:grid-cols-[1.1fr,0.85fr,0.9fr]">
          <div>
            <div className="footer-logo-row">
              <SmartImage
                src={brandLogo}
                fallbackSrc="/images/logo.png"
                alt={`${branding.name || 'School'} logo`}
                className="footer-logo"
              />
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">{schoolName}</p>
            </div>
            <h3 className="mt-2 max-w-sm font-heading text-lg leading-tight sm:text-xl">{footerHeading}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/80">{branding.motto}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/login" className="rounded-full border border-white/40 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:bg-white">
                Parent/Student
              </Link>
              <Link to="/staff-access" className="rounded-full border border-white/40 bg-white/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/18">
                Staff
              </Link>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">Quick Links</h4>
            <div className="mt-3 grid gap-1.5 text-sm text-white/88">
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
            <div className="mt-3 space-y-1.5 text-sm leading-6 text-white/88">
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
