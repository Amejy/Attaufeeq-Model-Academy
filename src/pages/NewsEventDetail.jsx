import { Link, useLocation, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PublicSectionFrame from '../components/public/PublicSectionFrame';
import SmartImage from '../components/SmartImage';
import { SkeletonBlock } from '../components/Skeleton';
import { apiJson } from '../utils/publicApi';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function NewsEventDetail() {
  const { slugOrId } = useParams();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const returnTo =
    typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/news')
      ? location.state.returnTo
      : '/news';

  useEffect(() => {
    let isCurrent = true;

    async function loadItem() {
      setLoading(true);
      setError('');

      try {
        const data = await apiJson(`/news/${slugOrId}`);
        if (!isCurrent) return;
        setItem(data.news || null);
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load news item.');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    loadItem();
    return () => {
      isCurrent = false;
    };
  }, [slugOrId]);

  return (
    <PublicSectionFrame
      eyebrow="News Detail"
      title={item?.title || 'Loading story'}
      description={item?.excerpt || 'Read the full update, view media, and return to the public news feed when you are done.'}
      image={item?.images?.[0] || DEFAULT_IMAGES.gallery}
      imageAlt={item?.title || 'News detail'}
      actions={(
        <Link to={returnTo} className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700">
          Back to News
        </Link>
      )}
    >
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {loading && (
        <article className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <SkeletonBlock className="h-3 w-40 rounded-full" />
          <SkeletonBlock className="mt-4 h-12 w-3/4 rounded-[24px]" />
          <SkeletonBlock className="mt-6 h-72 w-full rounded-[28px]" />
          <SkeletonBlock className="mt-6 h-4 w-full rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-11/12 rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-5/6 rounded-full" />
        </article>
      )}

      {!loading && !error && item && (
        <article className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {item.category} | {new Date(item.publishDate || item.createdAt).toLocaleDateString()} | {item.institution}
          </p>

          {Array.isArray(item.images) && item.images.length > 0 && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {item.images.map((url, index) => (
                <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-slate-200">
                  <SmartImage
                    src={url}
                    fallbackSrc={DEFAULT_IMAGES.gallery}
                    alt={`${item.title} ${index + 1}`}
                    className="h-64 w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}

          {Array.isArray(item.videos) && item.videos.length > 0 && (
            <div className="mt-6 space-y-4">
              {item.videos.map((url, index) => (
                <div key={`${url}-${index}`} className="news-detail__video-shell">
                  <video src={url} controls className="news-detail__video" />
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-4 text-base leading-8 text-slate-700">
            {String(item.content || '')
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </article>
      )}
    </PublicSectionFrame>
  );
}

export default NewsEventDetail;
