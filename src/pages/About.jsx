import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';

function About() {
  const { siteContent } = useSiteContent();
  const about = siteContent.about || {};
  const historySections = Array.isArray(about.historySections) ? about.historySections : [];

  return (
    <main className="section-wrap py-14">
      <h1 className="font-heading text-4xl text-primary">{about.title}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-start">
        <div>
          <h2 className="font-heading text-2xl text-primary">{about.historyTitle}</h2>
          {historySections.length ? (
            <div className="mt-4 space-y-6">
              {historySections.map((section) => (
                <section key={section.title || section.paragraphs?.[0]} className="rounded-xl border border-slate-200 bg-white p-5">
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
                </section>
              ))}

              {(about.signLabel || about.signatureImage) && (
                <section className="rounded-xl border border-slate-200 bg-white p-5">
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
                </section>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-7 text-slate-700">
              {about.historyText}
            </p>
          )}
        </div>
        <SmartImage
          src={about.image || '/images/campus.jpg'}
          fallbackSrc="/images/campus.jpg"
          alt="ATTAUFEEQ campus"
          className="h-72 w-full rounded-xl object-cover lg:sticky lg:top-24"
          loading="lazy"
        />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-heading text-2xl text-primary">{about.visionTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {about.visionText}
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 p-6">
          <h2 className="font-heading text-2xl text-primary">{about.missionTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {about.missionText}
          </p>
        </section>
      </div>

      <section className="mt-10 rounded-xl bg-muted p-6">
        <h2 className="font-heading text-2xl text-primary">{about.valuesTitle}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(about.values || []).map((value) => (
            <span key={value} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700">
              {value}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

export default About;
