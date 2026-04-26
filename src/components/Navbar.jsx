import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSiteContent } from '../context/SiteContentContext';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import SmartImage from './SmartImage';
import ThemeToggle from './ThemeToggle';
import Tooltip from './Tooltip';

const primaryLinks = [
  { to: '/', label: 'Home' },
  { to: '/academics', label: 'Academics' },
  { to: '/admissions', label: 'Admissions' },
  { to: '/news', label: 'News & Events' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact' }
];

const secondaryLinks = [
  { to: '/about', label: 'About' },
  { to: '/madrastul-attaufiq', label: 'Madrasa' },
  { to: '/modern-academy', label: 'ATTAUFEEQ Model Academy' }
];

const familyRoles = [
  { label: 'Parent/Student', to: '/login' }
];

const megaSections = [
  {
    title: 'Digital Campus',
    links: [
      { label: 'School Website', to: '/modern-academy', description: 'Explore the ATTAUFEEQ Model Academy experience.' },
      { label: 'About School', to: '/about', description: 'Mission, leadership, and our story.' }
    ]
  },
  {
    title: 'Academics',
    links: [
      { label: 'Check Result', to: '/result-checker', description: 'Secure result access for families.' }
    ]
  },
  {
    title: 'Academy Updates',
    links: [
      { label: 'School Announcements', to: '/news', description: 'Important school announcements, news, and events in one place.' }
    ]
  }
];

const madrasaMegaSections = [
  {
    title: 'Digital Campus',
    links: [
      { label: 'Madrasa Website', to: '/madrastul-attaufiq', description: 'Explore the Madrastul ATTAUFEEQ experience.' }
    ]
  },
  {
    title: 'Academics',
    links: [
      { label: 'Madrasa Results', to: '/result-checker', description: 'Secure access to madrasa assessments.' },
      { label: 'Admission Information', to: '/admissions', description: 'Apply for madrasa placement and review entry guidance.' }
    ]
  },
  {
    title: 'Madrasa Updates',
    links: [
      { label: 'Madrasa News', to: '/news?institution=Madrastul%20ATTAUFEEQ', description: 'Latest madrasa updates.' },
      { label: 'Madrasa Events', to: '/news?institution=Madrastul%20ATTAUFEEQ&category=event', description: 'Programs, ceremonies, and milestones.' },
    ]
  }
];

function initials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function landingLabel(branding = {}) {
  return branding.domain ? `${branding.domain} portal` : 'Digital Campus';
}

function splitPhoneNumbers(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function HeaderLink({ to, label, compact = false, onClick }) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={({ isActive }) =>
        compact
          ? `nav-mini-link ${isActive ? 'nav-mini-link--active' : ''}`
          : `nav-pill-link ${isActive ? 'nav-pill-link--active' : ''}`
      }
    >
      <span className={compact ? 'text-label-nowrap' : 'text-label-nowrap'}>{label}</span>
    </NavLink>
  );
}

function Navbar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [madrasaMegaOpen, setMadrasaMegaOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const avatarUrl = user?.avatarUrl || user?.profile?.avatarUrl || '';
  const { siteContent } = useSiteContent();
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const branding = siteContent.branding || {};
  const brandLogo = branding.logoUrl || '/images/logo.png';
  const phoneNumbers = useMemo(() => splitPhoneNumbers(branding.phone), [branding.phone]);
  const admissionsAvailable = !isLoading && periodOpen;
  const primaryLinksForDisplay = admissionsAvailable
    ? primaryLinks
    : primaryLinks.filter((link) => link.to !== '/admissions');
  const megaSectionsForDisplay = useMemo(
    () =>
      admissionsAvailable
        ? megaSections
        : megaSections.map((section) => ({
            ...section,
            links: section.links.filter((link) => link.to !== '/admissions')
          })),
    [admissionsAvailable]
  );
  const madrasaMegaSectionsForDisplay = useMemo(
    () =>
      admissionsAvailable
        ? madrasaMegaSections
        : madrasaMegaSections.map((section) => ({
            ...section,
            links: section.links.filter((link) => link.to !== '/admissions')
          })),
    [admissionsAvailable]
  );

  const mobileMegaLinks = useMemo(
    () =>
      megaSectionsForDisplay.flatMap((section) =>
        section.links.map((link) => ({
          key: `${section.title}-${link.to}`,
          ...link
        }))
      ),
    [megaSectionsForDisplay]
  );

  const mobileMadrasaLinks = useMemo(
    () =>
      madrasaMegaSectionsForDisplay.flatMap((section) =>
        section.links.map((link) => ({
          key: `${section.title}-${link.to}`,
          ...link
        }))
      ),
    [madrasaMegaSectionsForDisplay]
  );

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 32);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function closeMenus() {
      setProfileOpen(false);
      setMegaOpen(false);
      setMadrasaMegaOpen(false);
    }

    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsOpen(false);
      setMegaOpen(false);
      setMadrasaMegaOpen(false);
      setProfileOpen(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [location.pathname, location.search]);

  return (
    <header className="sticky top-0 z-40 px-3 py-0.5 sm:px-4">
      <div className={`section-wrap nav-super-shell transition-all duration-300 ${scrolled ? 'nav-super-shell--scrolled' : ''}`}>
        <div className="nav-super-shell__glow" />
        <div className="nav-theme-corner hidden lg:flex">
          <ThemeToggle />
        </div>

        <div className="nav-utility-ribbon hidden 2xl:flex">
          <div className="flex items-center gap-3">
            <span className="nav-status-dot" />
            <span>{branding.motto}</span>
            <span className="text-slate-300/70">•</span>
            <span>{branding.address}</span>
          </div>
          <div className="flex items-center gap-3">
            {phoneNumbers.length ? phoneNumbers.map((phone, index) => (
              <span key={phone} className="flex items-center gap-3">
                {index > 0 && <span className="text-slate-300/70">•</span>}
                <a href={`tel:${phone}`} className="hover:text-white">
                  {phone}
                </a>
              </span>
            )) : (
              <a href={`tel:${branding.phone || ''}`} className="hover:text-white">
                {branding.phone}
              </a>
            )}
            <span className="text-slate-300/70">•</span>
            <a href={`mailto:${branding.email || ''}`} className="hover:text-white">
              {branding.email}
            </a>
          </div>
        </div>

        <div className="nav-command-row">
          <div className="nav-brand-block">
            <div className="nav-brand-mark">
              <SmartImage
                src={brandLogo}
                fallbackSrc="/images/logo.png"
                alt={`${branding.name || 'School'} logo`}
                className="nav-brand-logo"
              />
              <span className="nav-brand-initials">AT</span>
            </div>
            <div className="min-w-0">
              <p className="nav-brand-label">{landingLabel(branding)}</p>
              <h1 className="nav-brand-title text-label-clamp" title={branding.name}>{branding.name}</h1>
              <p className="nav-brand-subtitle text-label-clamp" title={branding.navSubtitle}>{branding.navSubtitle}</p>
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 xl:block">
            <div className="nav-central-deck">
            <div className="nav-central-deck__eyebrow">
              <span className="nav-status-dot" />
              <span>Campus Navigation Grid</span>
            </div>
            <div className="nav-central-deck__main">
              <div
                className={`nav-mega ${megaOpen ? 'nav-mega--open' : ''}`}
                onMouseEnter={() => {
                  setMegaOpen(true);
                  setMadrasaMegaOpen(false);
                }}
                onMouseLeave={() => setMegaOpen(false)}
                onFocus={() => {
                  setMegaOpen(true);
                  setMadrasaMegaOpen(false);
                }}
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setMegaOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="nav-pill-link nav-mega-trigger"
                  onClick={() => {
                    setMegaOpen((prev) => !prev);
                    setMadrasaMegaOpen(false);
                  }}
                  aria-expanded={megaOpen}
                  aria-haspopup="true"
                >
                  <span>School Section</span>
                  <span className="nav-mega-caret" aria-hidden="true" />
                </button>
                <div className="nav-mega-panel" role="menu">
                  <div className="nav-mega-grid">
                    {megaSectionsForDisplay.map((section) => (
                      <div key={section.title} className="nav-mega-group">
                        <p className="nav-mega-title">{section.title}</p>
                        <div className="nav-mega-links">
                          {section.links.map((link) => (
                            <NavLink
                              key={`${section.title}-${link.to}`}
                              to={link.to}
                              className="nav-mega-link"
                              title={`${link.label}${link.description ? ` - ${link.description}` : ''}`}
                              onClick={() => setMegaOpen(false)}
                            >
                              <span>{link.label}</span>
                              <em>{link.description}</em>
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div
                className={`nav-mega ${madrasaMegaOpen ? 'nav-mega--open' : ''}`}
                onMouseEnter={() => {
                  setMadrasaMegaOpen(true);
                  setMegaOpen(false);
                }}
                onMouseLeave={() => setMadrasaMegaOpen(false)}
                onFocus={() => {
                  setMadrasaMegaOpen(true);
                  setMegaOpen(false);
                }}
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setMadrasaMegaOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="nav-pill-link nav-mega-trigger"
                  onClick={() => {
                    setMadrasaMegaOpen((prev) => !prev);
                    setMegaOpen(false);
                  }}
                  aria-expanded={madrasaMegaOpen}
                  aria-haspopup="true"
                >
                  <span>Madrasa Section</span>
                  <span className="nav-mega-caret" aria-hidden="true" />
                </button>
                <div className="nav-mega-panel" role="menu">
                  <div className="nav-mega-grid">
                    {madrasaMegaSectionsForDisplay.map((section) => (
                      <div key={section.title} className="nav-mega-group">
                        <p className="nav-mega-title">{section.title}</p>
                        <div className="nav-mega-links">
                          {section.links.map((link) => (
                            <NavLink
                              key={`${section.title}-${link.to}`}
                              to={link.to}
                              className="nav-mega-link"
                              title={`${link.label}${link.description ? ` - ${link.description}` : ''}`}
                              onClick={() => setMadrasaMegaOpen(false)}
                            >
                              <span>{link.label}</span>
                              <em>{link.description}</em>
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {primaryLinksForDisplay.map((link) => (
                <HeaderLink key={link.to} to={link.to} label={link.label} />
              ))}
              {!admissionsAvailable && (
                <span className="nav-pill-link cursor-default border-amber-200 bg-amber-50 text-amber-800 shadow-none">
                    Admissions Closed
                  </span>
                )}
              </div>
              <div className="nav-central-deck__sub">
                {secondaryLinks.map((link) => (
                  <HeaderLink key={link.to} to={link.to} label={link.label} compact />
                ))}
              </div>
            </div>
          </div>

          <div className="nav-action-stack">
            <div className="hidden items-center gap-2 lg:flex">
              {!isAuthenticated && (
                <div className="nav-family-rail">
                  {familyRoles.map((item) => (
                    <NavLink key={item.to} to={item.to} className="nav-family-chip">
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            {isAuthenticated ? (
              <div className="relative" onClick={(event) => event.stopPropagation()}>
                <Tooltip text={profileOpen ? 'Close account menu' : 'Open account menu'}>
                  <button type="button" onClick={() => setProfileOpen((prev) => !prev)} className="nav-profile-trigger">
                    <div className="nav-profile-avatar">
                      {avatarUrl ? (
                        <SmartImage src={avatarUrl} alt="Profile avatar" />
                      ) : (
                        initials(user?.fullName || user?.email || 'U')
                      )}
                    </div>
                    <div className="hidden min-w-0 text-left lg:block">
                      <p className="text-truncate-1 text-sm font-semibold text-slate-900" title={user?.fullName || 'Portal User'}>{user?.fullName || 'Portal User'}</p>
                      <p className="text-label-nowrap text-[11px] uppercase tracking-[0.2em] text-slate-500" title={`${user?.role || 'portal'} workspace`}>{user?.role} workspace</p>
                    </div>
                  </button>
                </Tooltip>

                {profileOpen && (
                  <div className="nav-profile-panel">
                    <p className="text-wrap-safe text-sm font-semibold text-slate-900">{user?.fullName || 'Portal User'}</p>
                    <p className="text-wrap-safe mt-1 text-xs text-slate-500">{user?.email}</p>
                    <div className="mt-4 grid gap-2">
                      <NavLink to={`/portal/${user?.role}`} className="nav-panel-primary">
                        Open Dashboard
                      </NavLink>
                      <button type="button" onClick={logout} className="nav-panel-secondary">
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden items-center gap-2 lg:flex">
                <NavLink to="/staff-access" className="nav-ghost-action">
                  Staff
                </NavLink>
                {admissionsAvailable ? (
                  <NavLink to="/admissions" className="nav-primary-action">
                    Start Admission
                  </NavLink>
                ) : (
                  <span className="nav-primary-action cursor-default opacity-70">
                    Admissions Closed
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 xl:hidden">
              <ThemeToggle />
              <Tooltip text={isOpen ? 'Close navigation menu' : 'Open navigation menu'}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen((prev) => !prev);
                    setMegaOpen(false);
                  }}
                  className="nav-mobile-trigger"
                  aria-expanded={isOpen}
                  aria-label="Toggle navigation menu"
                >
                  <span className="nav-mobile-trigger__label">Menu</span>
                  <span className="nav-mobile-trigger__bars">
                    <span />
                    <span />
                  </span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        <div
          className={`nav-mobile-overlay xl:hidden ${isOpen ? 'nav-mobile-overlay--open' : ''}`}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
        <div
          className={`nav-mobile-drawer xl:hidden ${isOpen ? 'nav-mobile-drawer--open' : ''}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="nav-mobile-panel">
            <div className="nav-mobile-panel__hero">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-800">Navigation Deck</p>
              <h2 className="mt-2 font-heading text-2xl text-primary sm:text-3xl">Clean, fast, premium access.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:mt-3 sm:leading-7">
                Family access stays public here. Internal school operations now live on a separate staff-only access URL.
              </p>
            </div>

            <div className="mt-5 grid gap-5 sm:mt-6 sm:gap-6">
              <div>
                <p className="nav-mobile-label">Primary</p>
                <div className="mt-3 grid gap-2">
                  {primaryLinksForDisplay.map((link) => (
                    <HeaderLink key={link.to} to={link.to} label={link.label} onClick={() => setIsOpen(false)} />
                  ))}
                  {!admissionsAvailable && (
                    <span className="nav-pill-link cursor-default border-amber-200 bg-amber-50 text-amber-800 shadow-none">
                      Admissions Closed
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="nav-mobile-label">School Section</p>
                <div className="mt-3 grid gap-2">
                  {mobileMegaLinks.map((link) => (
                    <NavLink
                      key={link.key}
                      to={link.to}
                      className="nav-pill-link"
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
              <div>
                <p className="nav-mobile-label">Madrasa Section</p>
                <div className="mt-3 grid gap-2">
                  {mobileMadrasaLinks.map((link) => (
                    <NavLink
                      key={link.key}
                      to={link.to}
                      className="nav-pill-link"
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>

              <div>
                <p className="nav-mobile-label">Explore</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {secondaryLinks.map((link) => (
                    <HeaderLink key={link.to} to={link.to} label={link.label} compact onClick={() => setIsOpen(false)} />
                  ))}
                </div>

                {!isAuthenticated && (
                  <>
                    <p className="nav-mobile-label mt-6">Family Access</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {familyRoles.map((item) => (
                        <NavLink key={item.to} to={item.to} className="nav-family-chip" onClick={() => setIsOpen(false)}>
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </>
                )}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {isAuthenticated ? (
                    <>
                      <NavLink to={`/portal/${user?.role}`} className="nav-primary-action" onClick={() => setIsOpen(false)}>
                        Open Dashboard
                      </NavLink>
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          setIsOpen(false);
                        }}
                        className="nav-ghost-action"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <NavLink to="/staff-access" className="nav-ghost-action" onClick={() => setIsOpen(false)}>
                        Staff
                      </NavLink>
                      {admissionsAvailable ? (
                        <NavLink to="/admissions" className="nav-primary-action" onClick={() => setIsOpen(false)}>
                          Start Admission
                        </NavLink>
                      ) : (
                        <span className="nav-primary-action cursor-default opacity-70">
                          Admissions Closed
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
