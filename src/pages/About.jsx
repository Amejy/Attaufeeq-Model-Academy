import SmartImage from '../components/SmartImage';
import { GlassPanel, PremiumHero, SectionIntro } from '../components/public/PremiumPublic';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function About() {
  const { siteContent } = useSiteContent();
  const about = siteContent.about || {};
  const historySections = Array.isArray(about.historySections) ? about.historySections : [];

  return (
    <main className="premium-page">
      <PremiumHero
        accent="school"
        badge="About School"
        title={about.title}
        kicker={about.historyTitle}
        description={about.historyText}
        image={about.image || DEFAULT_IMAGES.campus}
        imageAlt="ATTAUFEEQ campus"
      />

      <section className="section-wrap premium-band">
        <SectionIntro eyebrow="Our Story" title={about.historyTitle} description="" />
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-start">
        <div>
          {historySections.length ? (
            <div className="mt-4 space-y-6">
              {historySections.map((section) => (
                <GlassPanel key={section.title || section.paragraphs?.[0]} className="p-5">
                  {section.title && <h3 className="font-heading text-xl text-primary">{section.title}</h3>}
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                    {(section.paragraphs || []).map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  {!!section.bullets?.length && (
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </GlassPanel>
              ))}

              {(about.signLabel || about.signatureImage) && (
                <GlassPanel className="p-5">
                  {about.signLabel && <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{about.signLabel}</p>}
                  {about.signatureImage && (
                    <SmartImage
                      src={about.signatureImage}
                      fallbackSrc="/images/logo.png"
                      alt="Administrator signature"
                      className="mt-3 h-auto w-full max-w-[240px] object-contain"
                      loading="lazy"
                    />
                  )}
                </GlassPanel>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-7 text-slate-700">
              {about.historyText}
            </p>
          )}
        </div>
        <SmartImage
          src={about.image || DEFAULT_IMAGES.campus}
          fallbackSrc={DEFAULT_IMAGES.campus}
          alt="ATTAUFEEQ campus"
          className="h-72 w-full rounded-[28px] object-cover shadow-[0_20px_50px_rgba(8,_112,_184,_0.07)] lg:sticky lg:top-24"
          loading="lazy"
        />
        </div>
      </section>

      <section className="section-wrap pb-10">
        <div className="grid gap-6 md:grid-cols-2">
        <GlassPanel className="p-6">
          <h2 className="font-heading text-2xl text-primary">{about.visionTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {about.visionText}
          </p>
        </GlassPanel>
        <GlassPanel className="p-6">
          <h2 className="font-heading text-2xl text-primary">{about.missionTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {about.missionText}
          </p>
        </GlassPanel>
        </div>
      </section>

      <section className="section-wrap pb-20">
      <GlassPanel className="p-6">
        <h2 className="font-heading text-2xl text-primary">{about.valuesTitle}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(about.values || []).map((value) => (
            <span key={value} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700">
              {value}
            </span>
          ))}
        </div>
      </GlassPanel>
      </section>
    </main>
  );
}

export default About;
