import { Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { NewsCardSkeleton } from '../components/Skeleton';
import { apiJson } from '../utils/publicApi';
const CATEGORY_ICONS = {
  announcement: '◎',
  event: '◌',
  achievement: '▲',
  holiday: '◐',
  exam: '◈',
  examination: '◈',
  academic: '◉',
  program: '✧',
  default: '◦'
};

function NewsEvents() {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const institutionFilter = searchParams.get('institution') || '';
  const categoryFilter = searchParams.get('category') || '';

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.publishDate || b.createdAt || 0).getTime() -
          new Date(a.publishDate || a.createdAt || 0).getTime()
      ),
    [items]
  );

  const videoItems = useMemo(
    () => sortedItems.filter((item) => Array.isArray(item.videos) && item.videos.length > 0),
    [sortedItems]
  );
  const articleItems = useMemo(
    () => sortedItems.filter((item) => !Array.isArray(item.videos) || item.videos.length === 0),
    [sortedItems]
  );

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();
        if (institutionFilter) params.set('institution', institutionFilter);
        if (categoryFilter) params.set('category', categoryFilter);
        const query = params.toString();
        const data = await apiJson(`/news${query ? `?${query}` : ''}`);
        if (!isCurrent) return;
        setItems(data.news || []);
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load news/events.');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isCurrent = false;
    };
  }, [institutionFilter, categoryFilter]);

  return (
    <main className="section-wrap py-14">
      <section className="glass-panel overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">School Feed</p>
        <h1 className="mt-3 font-heading text-4xl text-primary">News & Events</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
          Follow school announcements, activities, examination schedules, holiday notices, and achievements.
        </p>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <NewsCardSkeleton key={index} />)}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-8 space-y-10">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Video Updates</p>
                <h2 className="mt-2 font-heading text-3xl text-primary">News Videos</h2>
                <p className="mt-2 text-sm text-slate-600">Campus highlights, ceremonies, and short updates in motion.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                {videoItems.length} video post{videoItems.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {videoItems.map((item, index) => (
                <article
                  key={item.id}
                  className={`news-card group overflow-hidden rounded-[32px] border border-white/60 bg-white/70 shadow-[0_22px_50px_rgba(15,23,42,0.08)] ${
                    index === 0 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="relative">
                    <div className="news-card__media">
                      {Array.isArray(item.images) && item.images.length > 0 ? (
                        <img
                          src={item.images[0]}
                          alt={item.title}
                          className="news-card__image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="news-card__placeholder bg-[radial-gradient(circle_at_top,#e2f0e6,#f8f5ee)]">
                          Video
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent" />
                      <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-900">
                        Video
                      </div>
                      <div className="absolute bottom-4 left-4 flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-emerald-900 shadow">
                          ▶
                        </span>
                        <span className="text-xs uppercase tracking-[0.28em] text-white/90">
                          {item.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="news-card__body px-5 pb-6 pt-5">
                    <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-primary">
                        {CATEGORY_ICONS[String(item.category || '').toLowerCase()] || CATEGORY_ICONS.default}
                      </span>
                      <span>{new Date(item.publishDate || item.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{item.institution}</span>
                    </p>
                    <h2 className="mt-2 font-heading text-2xl text-primary">{item.title}</h2>
                    <p className="mt-2 text-sm text-slate-700">
                      {item.excerpt || (item.content || '').slice(0, 140)}
                      {(item.content || '').length > 140 ? '...' : ''}
                    </p>
                    <Link
                      to={`/news/${item.slug || item.id}`}
                      state={{ returnTo: `/news${location.search || ''}` }}
                      className="glow-button mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white"
                    >
                      Watch Video <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
              {!videoItems.length && (
                <div className="glass-card p-5 text-sm text-slate-600">No video posts yet.</div>
              )}
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Written Updates</p>
                <h2 className="mt-2 font-heading text-3xl text-primary">News Articles</h2>
                <p className="mt-2 text-sm text-slate-600">Announcements, events, and detailed stories.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                {articleItems.length} article{articleItems.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {articleItems.map((item, index) => (
                <article
                  key={item.id}
                  className={`news-card group overflow-hidden rounded-[32px] border border-white/60 bg-white/70 shadow-[0_22px_50px_rgba(15,23,42,0.08)] ${
                    index === 0 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="relative">
                    <div className="news-card__media">
                      {Array.isArray(item.images) && item.images.length > 0 ? (
                        <img
                          src={item.images[0]}
                          alt={item.title}
                          className="news-card__image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="news-card__placeholder bg-[radial-gradient(circle_at_top,#f2efe6,#f8fbff)]">
                          Article
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/45 via-slate-900/10 to-transparent" />
                      <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-800">
                        Article
                      </div>
                      <div className="absolute bottom-4 left-4 flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-slate-800 shadow">
                          ✦
                        </span>
                        <span className="text-xs uppercase tracking-[0.28em] text-white/90">
                          {item.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="news-card__body px-5 pb-6 pt-5">
                    <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-primary">
                        {CATEGORY_ICONS[String(item.category || '').toLowerCase()] || CATEGORY_ICONS.default}
                      </span>
                      <span>{new Date(item.publishDate || item.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{item.institution}</span>
                    </p>
                    <h2 className="mt-2 font-heading text-2xl text-primary">{item.title}</h2>
                    <p className="mt-2 text-sm text-slate-700">
                      {item.excerpt || (item.content || '').slice(0, 140)}
                      {(item.content || '').length > 140 ? '...' : ''}
                    </p>
                    <Link
                      to={`/news/${item.slug || item.id}`}
                      state={{ returnTo: `/news${location.search || ''}` }}
                      className="glow-button mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white"
                    >
                      Read More <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
              {!articleItems.length && (
                <div className="glass-card p-5 text-sm text-slate-600">No articles yet.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {!loading && !error && !items.length && (
        <div className="mt-8 glass-card p-5 text-sm text-slate-600">
          No published news yet. Check back soon.
        </div>
      )}

      <div className="mt-8">
        <Link to="/contact" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Contact School
        </Link>
      </div>
    </main>
  );
}

export default NewsEvents;
