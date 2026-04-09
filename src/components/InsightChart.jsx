function getMaxValue(items) {
  return Math.max(...items.map((item) => item.value), 1);
}

function InsightBars({ title, subtitle, items = [] }) {
  const maxValue = getMaxValue(items);

  return (
    <section className="glass-card p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
          {subtitle && <p className="mt-2 text-sm leading-5 text-slate-600 sm:leading-6">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5 space-y-4 sm:mt-6">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-[13px] sm:text-sm">
              <span className="font-semibold text-slate-800">{item.label}</span>
              <span className="text-slate-500">{item.value}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200/80">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  background: item.color
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrbitChart({ title, value, maxValue, detail, ringColor = '#0f5132', glowColor = 'rgba(15,81,50,0.18)' }) {
  const safeMax = Math.max(maxValue, 1);
  const percentage = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percentage / 100) * circumference;

  return (
    <section className="glass-card flex flex-col items-center justify-center p-4 text-center sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <div className="relative mt-4 flex h-32 w-32 items-center justify-center sm:mt-5 sm:h-36 sm:w-36">
        <div
          className="absolute inset-4 rounded-full blur-2xl"
          style={{ background: glowColor }}
        />
        <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={radius} stroke="rgba(148,163,184,0.24)" strokeWidth="10" fill="none" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke={ringColor}
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute text-center">
          <p className="text-2xl font-bold text-primary sm:text-3xl">{Math.round(percentage)}%</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{value} / {safeMax}</p>
        </div>
      </div>
      {detail && <p className="mt-3 text-sm leading-5 text-slate-600 sm:mt-4 sm:leading-6">{detail}</p>}
    </section>
  );
}

export { InsightBars, OrbitChart };
