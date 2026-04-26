import PublicSectionFrame from '../components/public/PublicSectionFrame';
import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function About() {
  const { siteContent } = useSiteContent();
  const about = siteContent.about || {};
  const historySections = Array.isArray(about.historySections) ? about.historySections : [];

  return (
    <PublicSectionFrame
      eyebrow="About School"
      title={about.title}
      description={about.historyText || 'Learn the story, values, and direction of the school.'}
      image={about.image || DEFAULT_IMAGES.campus}
      imageAlt="About school"
    >
      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            {about.historyTitle || 'Our Story'}
          </p>
          <div className="mt-5 space-y-5">
            {historySections.length ? historySections.map((section) => (
              <section key={section.title || section.paragraphs?.[0]} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                {section.title ? <h2 className="break-words font-heading text-2xl text-primary">{section.title}</h2> : null}
                <div className="mt-3 space-y-3 text-sm leading-8 text-slate-700">
                  {(section.paragraphs || []).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {!!section.bullets?.length && (
                  <div className="mt-4 grid gap-2">
                    {section.bullets.map((item) => (
                      <div key={item} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )) : (
              <p className="text-sm leading-8 text-slate-700">{about.historyText}</p>
            )}
          </div>
        </article>

        <div className="grid gap-6">
          <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{about.visionTitle}</p>
            <p className="mt-3 text-sm leading-8 text-slate-700">{about.visionText}</p>
          </article>
          <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{about.missionTitle}</p>
            <p className="mt-3 text-sm leading-8 text-slate-700">{about.missionText}</p>
          </article>
          <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <SmartImage
              src={about.image || DEFAULT_IMAGES.community}
              fallbackSrc={DEFAULT_IMAGES.community}
              alt="School leadership"
              className="h-56 w-full object-cover"
            />
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{about.valuesTitle}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(about.values || []).map((value) => (
                  <span key={value} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                    {value}
                  </span>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>
    </PublicSectionFrame>
  );
}

export default About;
