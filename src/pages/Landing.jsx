import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import AnimatedCounter from '../components/AnimatedCounter';
import SmartImage from '../components/SmartImage';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import { getInstitutionImageFallback } from '../utils/defaultImages';

function normalizeBadge(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function Landing() {
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const { siteContent } = useSiteContent();
  const admissionsAvailable = !isLoading && periodOpen;
  const branding = siteContent.branding || {};
  const landing = siteContent.landing || {};
  const institutionCards = landing.institutions || [];
  const landingBadge = normalizeBadge(landing.badge, 'Digital Campus');

  return (
    <main className="overflow-hidden pb-20 pt-10 md:pt-16">
      <section className="section-wrap relative">
        <div className="hero-orb left-0 top-12 h-24 w-24 bg-emerald-200" />
        <div className="hero-orb right-12 top-0 h-28 w-28 bg-amber-200" />

        <div className="glass-panel relative overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,81,50,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(217,179,84,0.2),transparent_30%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
            <div>
              {landingBadge && (
                <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-800">
                  {landingBadge}
                </p>
              )}
              <h1 className="mt-6 max-w-4xl break-words font-heading text-4xl leading-tight text-primary sm:text-5xl lg:text-6xl">
                {landing.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
                {landing.description || `${branding.name} brings public school identity, portal access, admissions, news, and parent communication into one modern experience.`}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {admissionsAvailable ? (
                  <Link to="/admissions" className="glow-button rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                    Start Admission
                  </Link>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-800">
                    Admissions Closed By Admin
                  </span>
                )}
                <Link to="/login" className="rounded-full border border-slate-300 bg-white/75 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-white">
                  Open Portal
                </Link>
              </div>
              {!admissionsAvailable && (
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
                  Public application access stays hidden until admin opens the admission window again.
                </p>
              )}

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {(landing.stats || []).map((item) => (
                  <article key={item.title} className="surface-outline rounded-3xl p-4">
                    <p className="font-heading text-3xl text-primary">
                      <AnimatedCounter value={item.value} />
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="relative min-h-[440px] sm:min-h-[420px] lg:min-h-[360px]">
              <div className="gradient-shell soft-grid absolute inset-0 rounded-[36px] p-5 shadow-[0_30px_80px_rgba(8,37,26,0.22)] sm:p-6">
                <div className="flex h-full flex-col justify-between rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.82))] p-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/75">Portal Snapshot</p>
                    <h2 className="mt-3 max-w-[10ch] break-words font-heading text-3xl leading-tight sm:max-w-none">{landing.snapshotTitle}</h2>
                  </div>
                  <div className="mt-6 grid gap-3">
                    {(landing.snapshotItems || []).map((item) => (
                      <div key={item} className="rounded-2xl border border-white/14 bg-white/10 px-4 py-4">
                        <p className="text-sm font-semibold">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-wrap mt-10 grid gap-6 lg:grid-cols-2">
        {institutionCards.map((card) => {
          const cardBadge = normalizeBadge(card.badge, 'School Track');

          return (
            <article key={card.title} className="glass-card floating-card overflow-hidden p-4 sm:p-5">
              <div className={`rounded-[28px] bg-gradient-to-br ${card.accent} p-5 text-white`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
                    {cardBadge}
                  </span>
                  <span className="text-xs uppercase tracking-[0.22em] text-white/70">School entry</span>
                </div>
                <SmartImage
                  src={card.image}
                  fallbackSrc={getInstitutionImageFallback(card.to || card.title)}
                  alt={card.title}
                  className="mt-5 h-56 w-full rounded-[24px] object-cover sm:h-64"
                />
              </div>
            <div className="px-2 pb-2 pt-6">
              <h2 className="break-words font-heading text-3xl text-primary lg:text-4xl">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{card.description}</p>
              <Link to={card.to} className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary shadow-[0_14px_35px_rgba(8,37,26,0.12)] hover:-translate-y-0.5">
                Explore {cardBadge}
              </Link>
            </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export default Landing;
