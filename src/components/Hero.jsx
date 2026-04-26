import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import AnimatedCounter from './AnimatedCounter';
import SmartImage from './SmartImage';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import { DEFAULT_HERO_IMAGES } from '../utils/defaultImages';

function Hero() {
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const { siteContent } = useSiteContent();
  const admissionsAvailable = !isLoading && periodOpen;
  const branding = siteContent.branding || {};
  const brandLogo = branding.logoUrl || '/images/logo.png';
  const home = siteContent.home || {};
  const heroImages = home.heroImages?.length ? home.heroImages : DEFAULT_HERO_IMAGES;
  const heroStats = home.heroStats || [];

  return (
    <section className="section-wrap py-8 md:py-10">
      <div className="gradient-shell relative overflow-hidden rounded-[38px] px-6 py-10 text-white sm:px-10 sm:py-14">
        <div className="hero-orb -left-6 top-12 h-24 w-24 bg-emerald-300/70" />
        <div className="hero-orb right-10 top-6 h-20 w-20 bg-amber-300/70" />
        <div className="hero-orb bottom-10 right-1/3 h-16 w-16 bg-sky-200/60" />
        <div className="soft-grid absolute inset-0 opacity-20" />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr,0.95fr]">
          <div>
            <div className="hero-logo-badge">
              <SmartImage
                src={brandLogo}
                fallbackSrc="/images/logo.png"
                alt={`${branding.name || 'School'} logo`}
                className="hero-logo-badge__img"
                loading="eager"
              />
              <div>
                <p className="hero-logo-badge__label">Official Crest</p>
                <p className="hero-logo-badge__name text-label-clamp" title={branding.name}>{branding.name}</p>
              </div>
            </div>
            <p className="inline-flex max-w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/80 sm:tracking-[0.26em]">
              {home.heroBadge || 'ATTAUFEEQ Model Academy'}
            </p>
            <h1 className="mt-6 max-w-3xl break-words font-heading text-3xl leading-tight sm:text-4xl md:text-5xl lg:text-6xl">
              {home.heroTitle}
            </h1>
            <p className="mt-4 text-base font-medium text-white/88 sm:text-lg">{branding.motto}</p>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-white/85 sm:text-base sm:leading-8">
              {home.heroDescription || branding.intro}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {admissionsAvailable ? (
                <Link to="/admissions" className="w-full rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-primary hover:bg-emerald-50 sm:w-auto">
                  Apply Now
                </Link>
              ) : (
                <span className="w-full rounded-full border border-white/40 bg-white/12 px-6 py-3 text-center text-sm font-semibold text-white/82 sm:w-auto">
                  Admissions Closed
                </span>
              )}
              <Link to="/login" className="w-full rounded-full border border-white/50 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-white/15 sm:w-auto">
                Parent/Student
              </Link>
              <Link to="/staff-access" className="w-full rounded-full border border-white/50 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-white/15 sm:w-auto">
                Staff
              </Link>
              <Link to="/contact" className="w-full rounded-full border border-white/50 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-white/15 sm:w-auto">
                Contact Us
              </Link>
            </div>
            {!admissionsAvailable && (
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/78">
                The family application route switches off automatically whenever admin closes the active admission period.
              </p>
            )}
          </div>

          <div className="relative">
            <div className="hero-stack">
              <div className="hero-stack__card hero-stack__card--main">
                <SmartImage
                  src={heroImages[0]?.url || DEFAULT_HERO_IMAGES[0].url}
                  fallbackSrc={DEFAULT_HERO_IMAGES[0].url}
                  alt={heroImages[0]?.alt || DEFAULT_HERO_IMAGES[0].alt}
                  loading="eager"
                />
              </div>
              <div className="hero-stack__card hero-stack__card--top">
                <SmartImage
                  src={heroImages[1]?.url || DEFAULT_HERO_IMAGES[1].url}
                  fallbackSrc={DEFAULT_HERO_IMAGES[1].url}
                  alt={heroImages[1]?.alt || DEFAULT_HERO_IMAGES[1].alt}
                />
              </div>
              <div className="hero-stack__card hero-stack__card--bottom">
                <SmartImage
                  src={heroImages[2]?.url || DEFAULT_HERO_IMAGES[2].url}
                  fallbackSrc={DEFAULT_HERO_IMAGES[2].url}
                  alt={heroImages[2]?.alt || DEFAULT_HERO_IMAGES[2].alt}
                />
              </div>

              <div className="hero-stack__stats">
                {heroStats.map((item) => (
                  <div key={item.title} className="hero-stack__stat">
                    <p className="font-heading text-2xl text-primary">
                      <AnimatedCounter value={item.value} />
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
