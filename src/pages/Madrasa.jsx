import { Link } from 'react-router-dom';
import SmartImage from '../components/SmartImage';
import { GlassPanel, LiveTicker, PremiumHero, SectionIntro } from '../components/public/PremiumPublic';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function Madrasa() {
  const { siteContent } = useSiteContent();
  const madrasa = siteContent.madrasa || {};
  const madrasaModules = madrasa.modules || [];

  return (
    <main className="premium-page">
      <PremiumHero
        accent="madrasa"
        badge={madrasa.eyebrow}
        title={madrasa.title}
        kicker="Madrasa Website"
        description={madrasa.description}
        image={madrasa.image || DEFAULT_IMAGES.madrasa}
        imageAlt="Madrasa learning"
        primaryAction={{ to: '/admissions', label: 'Apply Now' }}
        secondaryAction={{ to: '/', label: 'Switch Campus' }}
      >
        <div className="mt-5 max-w-2xl">
          <LiveTicker
            accent="madrasa"
            items={['Madrasa Website', 'Madrasa Results', 'Madrasa News', 'Madrasa Events', 'Admission Information']}
          />
        </div>
      </PremiumHero>

      <section className="section-wrap premium-band">
        <SectionIntro
          eyebrow="Learning Modules"
          title={madrasa.modulesTitle}
          description={madrasa.modulesSubtitle}
          align="center"
        />
        <div className="grid gap-6 sm:grid-cols-2">
          {madrasaModules.map((module) => (
            <GlassPanel key={module.title} className="card-feature p-6">
              <h3 className="font-heading text-2xl text-primary">{module.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">{module.text}</p>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section className="section-wrap pb-20">
        <GlassPanel className="premium-split-card p-6 sm:p-8">
          <div className="premium-media-card min-h-[280px]">
            <SmartImage
              src={madrasa.image || DEFAULT_IMAGES.madrasa}
              fallbackSrc={DEFAULT_IMAGES.madrasa}
              alt="Madrasa learning"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div>
            <p className="premium-section-intro__eyebrow">Live Islamic Campus</p>
            <h2 className="premium-section-intro__title text-[clamp(1.8rem,4vw,2.8rem)]">
              Spiritual depth, disciplined study, and a calmer digital experience
            </h2>
            <p className="premium-section-intro__description">
              This madrasa pathway stays connected to the main portal while preserving its own learning rhythm, values, and program identity.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/news?institution=Madrastul%20ATTAUFEEQ" className="premium-button premium-button--primary">Open Madrasa News</Link>
              <Link to="/result-checker" className="premium-button rounded-full border border-slate-300 bg-white px-6 text-slate-700">Check Result</Link>
            </div>
          </div>
        </GlassPanel>
      </section>
    </main>
  );
}

export default Madrasa;
