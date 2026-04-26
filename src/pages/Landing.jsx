import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import SmartImage from '../components/SmartImage';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function buildSectionCards(admissionsAvailable) {
  return [
    {
      id: 'school',
      title: 'School Section',
      subtitle: 'ATTAUFEEQ Model Academy',
      tone: 'from-emerald-900 via-emerald-800 to-emerald-700',
      image: DEFAULT_IMAGES.students,
      items: [
        { label: 'School Website', to: '/modern-academy' },
        { label: 'About School', to: '/about' },
        { label: 'Check Result', to: '/result-checker' },
        { label: 'School Announcements', to: '/news' }
      ]
    },
    {
      id: 'madrasa',
      title: 'Madrasa Section',
      subtitle: 'Madrastul ATTAUFEEQ',
      tone: 'from-slate-900 via-slate-800 to-slate-700',
      image: DEFAULT_IMAGES.madrasa,
      items: [
        { label: 'Madrasa Website', to: '/madrastul-attaufiq' },
        { label: 'Madrasa Results', to: '/result-checker?institution=Madrastul%20ATTAUFEEQ' },
        { label: 'Madrasa News', to: '/news?institution=Madrastul%20ATTAUFEEQ' },
        { label: 'Madrasa Events', to: '/news?institution=Madrastul%20ATTAUFEEQ&category=event' },
        { label: 'Admission Information', to: admissionsAvailable ? '/admissions' : '/admissions' }
      ]
    }
  ];
}

function Landing() {
  const { siteContent } = useSiteContent();
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const admissionsAvailable = !isLoading && periodOpen;
  const branding = siteContent.branding || {};
  const landing = siteContent.landing || {};
  const sectionCards =
    Array.isArray(landing.institutions) && landing.institutions.length
      ? landing.institutions.map((institution, index) => ({
          id: institution.title || `institution-${index}`,
          title: institution.badge || 'Section',
          subtitle: institution.title,
          tone: institution.accent || (index === 0 ? 'from-emerald-900 via-emerald-800 to-emerald-700' : 'from-slate-900 via-slate-800 to-amber-600'),
          image: institution.image || (index === 0 ? DEFAULT_IMAGES.students : DEFAULT_IMAGES.madrasa),
          items:
            index === 0
              ? [
                  { label: 'School Website', to: institution.to || '/modern-academy' },
                  { label: 'About School', to: '/about' },
                  { label: 'Check Result', to: '/result-checker' },
                  { label: 'School Announcements', to: '/news' }
                ]
              : [
                  { label: 'Madrasa Website', to: institution.to || '/madrastul-attaufiq' },
                  { label: 'Madrasa Results', to: '/result-checker?institution=Madrastul%20ATTAUFEEQ' },
                  { label: 'Madrasa News', to: '/news?institution=Madrastul%20ATTAUFEEQ' },
                  { label: 'Madrasa Events', to: '/news?institution=Madrastul%20ATTAUFEEQ&category=event' },
                  { label: 'Admission Information', to: '/admissions' }
                ],
          description: institution.description
        }))
      : buildSectionCards(admissionsAvailable);
  const snapshotItems = Array.isArray(landing.snapshotItems) ? landing.snapshotItems : [];

  return (
    <main className="section-wrap py-8 sm:py-10">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="grid lg:grid-cols-[1.05fr,0.95fr]">
          <div className="px-6 py-8 sm:px-10 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {landing.badge || 'Digital Campus'}
            </p>
            <h1 className="mt-3 max-w-4xl break-words font-heading text-4xl leading-tight text-primary sm:text-5xl">
              {landing.title || 'A clearer public system for school and madrasa access'}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-700 sm:text-base">
              {landing.description || `${branding.name || 'ATTAUFEEQ'} now opens with two focused public tracks. Each section leads directly into the exact pages families need without extra clutter.`}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {(landing.stats || []).slice(0, 3).map((item) => (
                <article key={item.title} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{item.title}</p>
                  <p className="mt-2 font-heading text-3xl text-primary">{item.value}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.text}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/modern-academy" className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white">
                Open School Section
              </Link>
              <Link to="/madrastul-attaufiq" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700">
                Open Madrasa Section
              </Link>
              <Link to="/login" className="rounded-full border border-slate-300 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-700">
                Parent / Student Portal
              </Link>
            </div>

            {!admissionsAvailable && (
              <p className="mt-4 text-sm text-amber-700">
                Admission routes stay visible here, but new applications reopen only when admin enables the window.
              </p>
            )}
          </div>

          <div className="relative min-h-[320px] lg:min-h-full">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,81,50,0.24),rgba(217,179,84,0.16))]" />
            <SmartImage
              src={DEFAULT_IMAGES.campus}
              fallbackSrc={DEFAULT_IMAGES.campus}
              alt="ATTAUFEEQ campus"
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
        <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            {landing.snapshotTitle || 'Why This Hub Works'}
          </p>
          <h2 className="mt-3 max-w-2xl break-words font-heading text-3xl text-primary">
            Families should land once and know exactly where to go next.
          </h2>
          <p className="mt-4 text-sm leading-8 text-slate-700">
            This entry point keeps the school website, madrasa website, results, admissions, and updates clearly separated while still feeling like one trusted institution.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {snapshotItems.slice(0, 4).map((item) => (
              <div key={item} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <SmartImage
            src={DEFAULT_IMAGES.community}
            fallbackSrc={DEFAULT_IMAGES.community}
            alt="School community"
            className="h-64 w-full object-cover"
          />
          <div className="grid gap-4 p-6 sm:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Public Access</p>
              <h2 className="mt-3 break-words font-heading text-3xl text-primary">School identity first, portal access when needed.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/news" className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-200 hover:bg-white">
                Browse updates
              </Link>
              <Link to="/result-checker" className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-200 hover:bg-white">
                Open result checker
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        {sectionCards.map((section) => (
          <article key={section.id} className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className={`grid gap-0 lg:grid-cols-[0.9fr,1.1fr] bg-gradient-to-br ${section.tone}`}>
              <div className="px-6 py-8 text-white sm:px-8">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">{section.title}</p>
                <h2 className="mt-3 break-words font-heading text-4xl">{section.subtitle}</h2>
                {section.description ? <p className="mt-3 max-w-md text-sm leading-7 text-white/82">{section.description}</p> : null}
              </div>
              <SmartImage
                src={section.image}
                fallbackSrc={section.image}
                alt={section.subtitle}
                className="h-64 w-full object-cover lg:h-full"
              />
            </div>
            <div className="grid gap-3 px-6 py-6 sm:px-8">
              {section.items.map((item) => (
                <Link
                  key={`${section.id}-${item.label}`}
                  to={item.to}
                  className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-200 hover:bg-white"
                >
                  <span>{item.label}</span>
                  <span className="text-primary">Open</span>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

export default Landing;
