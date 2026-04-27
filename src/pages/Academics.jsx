import SmartImage from '../components/SmartImage';
import { GlassPanel, PremiumHero, SectionIntro } from '../components/public/PremiumPublic';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function Academics() {
  const { siteContent } = useSiteContent();
  const academics = siteContent.academics || {};

  return (
    <main className="premium-page">
      <PremiumHero
        accent="school"
        badge="Academics"
        title={academics.title}
        kicker="School Section"
        description={academics.intro}
        image={academics.image || DEFAULT_IMAGES.students}
        imageAlt="Students in class"
      />

      <section className="section-wrap premium-band">
        <SectionIntro eyebrow="Educational Levels" title={academics.levelsTitle} description="" />
        <GlassPanel className="premium-split-card p-6 sm:p-8">
        <div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {(academics.levels || []).map((level) => <li key={level}>{level}</li>)}
          </ul>
        </div>
        <div className="premium-media-card">
          <SmartImage
          src={academics.image || DEFAULT_IMAGES.students}
          fallbackSrc={DEFAULT_IMAGES.students}
          alt="Students in class"
          className="h-72 w-full object-cover md:h-full"
          loading="lazy"
        />
        </div>
        </GlassPanel>
      </section>

      <section className="section-wrap pb-20">
        <div className="grid gap-6 md:grid-cols-2">
        <GlassPanel className="p-6">
          <h2 className="font-heading text-2xl text-primary">{academics.subjectsTitle}</h2>
          <p className="mt-3 text-sm text-slate-700">
            {academics.subjectsText}
          </p>
        </GlassPanel>
        <GlassPanel className="p-6">
          <h2 className="font-heading text-2xl text-primary">{academics.curriculumTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {academics.curriculumText}
          </p>
        </GlassPanel>
        </div>
      </section>
    </main>
  );
}

export default Academics;
