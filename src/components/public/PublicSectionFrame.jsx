import SmartImage from '../SmartImage';

function PublicSectionFrame({
  eyebrow = '',
  title = '',
  description = '',
  image = '',
  imageAlt = '',
  actions = null,
  metrics = [],
  children
}) {
  return (
    <main className="section-wrap py-8 sm:py-10">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[1.02fr,0.98fr]">
          <div className="flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-12">
            <div>
              {eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
              )}
              <h1 className="mt-3 max-w-3xl break-words font-heading text-4xl leading-tight text-primary sm:text-5xl">
                {title}
              </h1>
              {description && (
                <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-700 sm:text-base">
                  {description}
                </p>
              )}
              {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
            </div>

            {!!metrics.length && (
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <article key={metric.label} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                    <p className="mt-2 font-heading text-3xl text-primary">{metric.value}</p>
                    {metric.note ? <p className="mt-2 text-sm text-slate-600">{metric.note}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="relative min-h-[280px] lg:min-h-full">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,81,50,0.18),rgba(217,179,84,0.12))]" />
            <SmartImage
              src={image}
              alt={imageAlt || title}
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {children}
    </main>
  );
}

export default PublicSectionFrame;
