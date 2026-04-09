import { Link } from 'react-router-dom';
import { useSiteContent } from '../context/SiteContentContext';

function Madrasa() {
  const { siteContent } = useSiteContent();
  const madrasa = siteContent.madrasa || {};
  const madrasaModules = madrasa.modules || [];

  return (
    <>
      <section className="bg-gradient-to-r from-primary to-emerald-700 py-16 text-white">
        <div className="section-wrap grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">{madrasa.eyebrow}</p>
            <h1 className="mt-2 font-heading text-4xl md:text-5xl">{madrasa.title}</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/90">
              {madrasa.description}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/admissions"
                className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-yellow-300"
              >
                Apply Now
              </Link>
              <Link
                to="/"
                className="rounded-md border border-white/80 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Back To Institution Selector
              </Link>
            </div>
          </div>
          <img
            src={madrasa.image || '/images/islamic-class.jpg'}
            alt="Madrasa learning"
            className="h-[320px] w-full rounded-xl object-cover shadow-lg"
          />
        </div>
      </section>

      <section className="section-wrap py-14">
        <div className="mb-8 text-center">
          <h2 className="font-heading text-3xl text-primary">{madrasa.modulesTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {madrasa.modulesSubtitle}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {madrasaModules.map((module) => (
            <article key={module.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-heading text-2xl text-primary">{module.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">{module.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export default Madrasa;
