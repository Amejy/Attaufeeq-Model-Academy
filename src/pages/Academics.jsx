import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';

function Academics() {
  const { siteContent } = useSiteContent();
  const academics = siteContent.academics || {};

  return (
    <main className="section-wrap py-14">
      <h1 className="font-heading text-4xl text-primary">{academics.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
        {academics.intro}
      </p>

      <section className="mt-8 grid gap-6 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="font-heading text-2xl text-primary">{academics.levelsTitle}</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {(academics.levels || []).map((level) => <li key={level}>{level}</li>)}
          </ul>
        </div>
        <SmartImage
          src={academics.image || '/images/students.jpg'}
          fallbackSrc="/images/students.jpg"
          alt="Students in class"
          className="h-72 w-full rounded-xl object-cover"
          loading="lazy"
        />
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-heading text-2xl text-primary">{academics.subjectsTitle}</h2>
          <p className="mt-3 text-sm text-slate-700">
            {academics.subjectsText}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-heading text-2xl text-primary">{academics.curriculumTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {academics.curriculumText}
          </p>
        </article>
      </section>
    </main>
  );
}

export default Academics;
