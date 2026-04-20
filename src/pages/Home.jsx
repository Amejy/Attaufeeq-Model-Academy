import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import FeatureCard from '../components/FeatureCard';
import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import useAdmissionPeriod from '../hooks/useAdmissionPeriod';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function Home() {
  const { isLoading, periodOpen } = useAdmissionPeriod();
  const { siteContent } = useSiteContent();
  const admissionsAvailable = !isLoading && periodOpen;
  const home = siteContent.home || {};
  const highlights = home.highlights || [];
  const academicPrograms = home.programs || [];

  return (
    <>
      <Hero />

      <section className="section-wrap py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{home.highlightsEyebrow}</p>
            <h2 className="mt-2 break-words font-heading text-3xl text-primary md:text-5xl">{home.highlightsTitle}</h2>
          </div>
          <div className="glass-card max-w-xl px-5 py-4 text-sm leading-7 text-slate-600">
            {home.highlightsDescription}
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {highlights.map((item) => (
            <FeatureCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="section-wrap py-8">
        <div className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr] lg:items-center">
          <div className="glass-panel p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{home.storyEyebrow}</p>
            <h2 className="mt-3 break-words font-heading text-3xl text-primary md:text-4xl">{home.storyTitle}</h2>
            <p className="mt-4 text-sm leading-8 text-slate-700">
              {home.storyText}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/about" className="glow-button rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                Learn More
              </Link>
              <Link to="/contact" className="rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-white">
                Visit Campus
              </Link>
            </div>
          </div>

          <div className="relative min-h-[340px]">
            <div className="absolute inset-0 rounded-[34px] bg-gradient-to-br from-emerald-100 via-white to-amber-100" />
            <SmartImage
              src={home.storyImage || DEFAULT_IMAGES.campus}
              fallbackSrc={DEFAULT_IMAGES.campus}
              alt="School campus"
              className="relative h-full min-h-[340px] w-full rounded-[34px] object-cover shadow-[0_25px_60px_rgba(8,37,26,0.16)]"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section className="section-wrap py-14">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{home.programsEyebrow}</p>
          <h2 className="mt-2 break-words font-heading text-3xl text-primary md:text-5xl">{home.programsTitle}</h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {home.programsDescription}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {academicPrograms.map((program) => (
            <article key={program.title} className="glass-card floating-card p-5 sm:p-6">
              <SmartImage
                src={program.image}
                fallbackSrc={DEFAULT_IMAGES.students}
                alt={program.title}
                className="h-56 w-full rounded-[26px] object-cover"
                loading="lazy"
              />
              <h3 className="mt-5 break-words font-heading text-3xl text-primary">{program.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">{program.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {program.standards.map((item) => (
                  <span key={item} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-wrap py-10">
        <div className="gradient-shell overflow-hidden rounded-[36px] px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">{home.ctaEyebrow}</p>
              <h2 className="mt-2 break-words font-heading text-3xl md:text-5xl">{home.ctaTitle}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-8 text-white/82">
                {home.ctaDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              {admissionsAvailable ? (
                <Link to="/admissions" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary hover:bg-emerald-50">
                  Apply for Admission
                </Link>
              ) : (
                <span className="rounded-full border border-white/40 bg-white/12 px-6 py-3 text-sm font-semibold text-white/82">
                  Admissions Closed
                </span>
              )}
              <Link to="/contact" className="rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15">
                Contact School
              </Link>
              <Link to="/" className="rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15">
                Switch Institution
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default Home;
