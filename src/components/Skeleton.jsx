function SkeletonBlock({ className = '' }) {
  return <div className={`skeleton-block ${className}`.trim()} aria-hidden="true" />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="glass-card p-4 sm:p-5">
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <SkeletonBlock className="mt-4 h-10 w-28 rounded-2xl" />
            <SkeletonBlock className="mt-4 h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="glass-card p-4 sm:p-6">
          <SkeletonBlock className="h-4 w-32 rounded-full" />
          <SkeletonBlock className="mt-5 h-56 w-full rounded-[28px]" />
        </div>
        <div className="glass-card p-4 sm:p-6">
          <SkeletonBlock className="h-4 w-24 rounded-full" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsCardSkeleton() {
  return (
    <article className="glass-card news-card overflow-hidden p-4">
      <SkeletonBlock className="news-card__media" />
      <SkeletonBlock className="mt-5 h-3 w-32 rounded-full" />
      <SkeletonBlock className="mt-4 h-8 w-4/5 rounded-2xl" />
      <SkeletonBlock className="mt-3 h-3 w-full rounded-full" />
      <SkeletonBlock className="mt-2 h-3 w-11/12 rounded-full" />
      <SkeletonBlock className="mt-6 h-11 w-36 rounded-full" />
    </article>
  );
}

export { DashboardSkeleton, NewsCardSkeleton, SkeletonBlock };
