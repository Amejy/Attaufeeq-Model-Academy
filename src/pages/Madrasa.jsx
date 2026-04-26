import { Link } from 'react-router-dom';
import PublicSectionFrame from '../components/public/PublicSectionFrame';
import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function Madrasa() {
  const { siteContent } = useSiteContent();
  const madrasa = siteContent.madrasa || {};
  const madrasaModules = madrasa.modules || [];

  return (
    <PublicSectionFrame
      eyebrow={madrasa.eyebrow || 'Madrasa Website'}
      title={madrasa.title}
      description={madrasa.description}
      image={madrasa.image || DEFAULT_IMAGES.madrasa}
      imageAlt="Madrasa learning"
      actions={(
        <>
          <Link to="/admissions" className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white">
            Apply to Madrasa
          </Link>
          <Link to="/result-checker?institution=Madrastul%20ATTAUFEEQ" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700">
            Check Madrasa Result
          </Link>
          <Link to="/news?institution=Madrastul%20ATTAUFEEQ" className="rounded-full border border-slate-300 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-700">
            Madrasa Updates
          </Link>
        </>
      )}
      metrics={[
        { label: 'Track', value: 'Islamic', note: 'Faith, discipline, and memorization-centered learning.' },
        { label: 'Modules', value: String(madrasaModules.length || 0), note: 'Structured Qur\'an and Islamic studies touchpoints.' },
        { label: 'Access', value: 'Digital', note: 'Results, admissions, and updates remain easy to reach.' }
      ]}
    >
      <section className="mt-8 grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
        <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            {madrasa.modulesTitle || 'Learning Modules'}
          </p>
          <h2 className="mt-3 break-words font-heading text-3xl text-primary">
            A focused Islamic learning journey with calm structure.
          </h2>
          <p className="mt-3 text-sm leading-8 text-slate-700">
            {madrasa.modulesSubtitle || 'Each module reinforces Qur\'an recitation, memorization growth, Arabic familiarity, and moral formation.'}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {madrasaModules.map((module) => (
              <article key={module.title} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <h3 className="break-words font-heading text-2xl text-primary">{module.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-700">{module.text}</p>
              </article>
            ))}
          </div>
        </article>

        <div className="grid gap-6">
          <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <SmartImage
              src={madrasa.image || DEFAULT_IMAGES.madrasa}
              fallbackSrc={DEFAULT_IMAGES.madrasa}
              alt="Madrasa class"
              className="h-64 w-full object-cover"
              loading="lazy"
            />
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Why Families Choose It</p>
              <p className="mt-3 text-sm leading-8 text-slate-700">
                Students move through an environment shaped by recitation, memorization discipline, and values-led instruction that remains connected to the wider ATTAUFEEQ identity.
              </p>
            </div>
          </article>

          <article className="rounded-[30px] border border-slate-200 bg-primary p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Quick Paths</p>
            <div className="mt-4 grid gap-3">
              <Link to="/" className="rounded-[20px] border border-white/20 bg-white/10 px-4 py-4 text-sm font-semibold text-white">
                Back to institution selector
              </Link>
              <Link to="/admissions" className="rounded-[20px] border border-white/20 bg-white/10 px-4 py-4 text-sm font-semibold text-white">
                Admission information
              </Link>
            </div>
          </article>
        </div>
      </section>
    </PublicSectionFrame>
  );
}

export default Madrasa;
