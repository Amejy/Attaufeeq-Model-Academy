import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import PublicSectionFrame from '../components/public/PublicSectionFrame';
import SmartImage from '../components/SmartImage';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function Home() {
  const { siteContent } = useSiteContent();
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const admissionsAvailable = !isLoading && periodOpen;
  const home = siteContent.home || {};
  const highlights = home.highlights || [];
  const programs = home.programs || [];

  return (
    <PublicSectionFrame
      eyebrow={home.heroBadge || 'School Website'}
      title={home.heroTitle}
      description={home.heroDescription || home.storyText}
      image={(home.heroImages && home.heroImages[0]?.url) || DEFAULT_IMAGES.students}
      imageAlt={(home.heroImages && home.heroImages[0]?.alt) || 'School website hero'}
      actions={(
        <>
          {admissionsAvailable ? (
            <Link to="/admissions" className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white">
              Start Admission
            </Link>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-800">
              Admissions Closed
            </span>
          )}
          <Link to="/about" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700">
            About School
          </Link>
          <Link to="/news" className="rounded-full border border-slate-300 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-700">
            School Announcements
          </Link>
        </>
      )}
      metrics={(home.heroStats || []).slice(0, 3).map((item) => ({
        label: item.title,
        value: item.value,
        note: item.text
      }))}
    >
      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            {home.storyEyebrow || 'About the School'}
          </p>
          <h2 className="mt-3 break-words font-heading text-3xl text-primary">
            {home.storyTitle || 'A school website built around clarity and trust'}
          </h2>
          <p className="mt-4 text-sm leading-8 text-slate-700">
            {home.storyText}
          </p>
          <div className="mt-6 grid gap-3">
            <Link to="/about" className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800">
              <span>Read our full story</span>
              <span className="text-primary">About School</span>
            </Link>
            <Link to="/result-checker" className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800">
              <span>Open result checking</span>
              <span className="text-primary">Check Result</span>
            </Link>
          </div>
        </article>

        <div className="grid gap-4 sm:grid-cols-2">
          {highlights.map((item, index) => (
            <article
              key={item.title}
              className={`rounded-[28px] border border-slate-200 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] ${
                index === 0 ? 'bg-primary text-white sm:col-span-2' : 'bg-white'
              }`}
            >
              <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${index === 0 ? 'text-white/70' : 'text-slate-500'}`}>
                Focus Area
              </p>
              <h3 className={`mt-3 break-words font-heading text-3xl ${index === 0 ? 'text-white' : 'text-primary'}`}>
                {item.title}
              </h3>
              <p className={`mt-3 text-sm leading-7 ${index === 0 ? 'text-white/85' : 'text-slate-700'}`}>
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {home.programsEyebrow || 'Academic Programs'}
            </p>
            <h2 className="mt-3 break-words font-heading text-3xl text-primary">
              {home.programsTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-700">
              {home.programsDescription}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {programs.map((program) => (
            <article key={program.title} className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50">
              <SmartImage
                src={program.image || DEFAULT_IMAGES.classroom}
                fallbackSrc={DEFAULT_IMAGES.classroom}
                alt={program.title}
                className="h-56 w-full object-cover"
              />
              <div className="p-5">
                <h3 className="break-words font-heading text-3xl text-primary">{program.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-700">{program.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(program.standards || []).map((item) => (
                    <span key={item} className="rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PublicSectionFrame>
  );
}

export default Home;
