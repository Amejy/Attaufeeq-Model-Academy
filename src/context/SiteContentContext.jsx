/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiJson } from '../utils/publicApi';

const SiteContentContext = createContext(null);

const emptySiteContent = {
  branding: {},
  landing: { stats: [], snapshotItems: [], institutions: [] },
  home: { heroStats: [], heroImages: [], highlights: [], programs: [] },
  about: { values: [] },
  academics: { levels: [] },
  staff: { featuredStaff: [] },
  gallery: { photos: [] },
  madrasa: { modules: [] },
  contact: {}
};

let cachedSiteContent = emptySiteContent;
let siteContentLoaded = false;
let siteContentPromise = null;

async function fetchSiteContent({ force = false } = {}) {
  if (force) {
    siteContentLoaded = false;
    siteContentPromise = null;
  }

  if (siteContentLoaded && !force) {
    return cachedSiteContent;
  }

  if (siteContentPromise) {
    return siteContentPromise;
  }

  siteContentPromise = (async () => {
    const data = await apiJson('/site-content');
    cachedSiteContent = data.content || emptySiteContent;
    siteContentLoaded = true;
    return cachedSiteContent;
  })();

  try {
    return await siteContentPromise;
  } finally {
    siteContentPromise = null;
  }
}

export function SiteContentProvider({ children }) {
  const [siteContent, setSiteContent] = useState(() => (siteContentLoaded ? cachedSiteContent : emptySiteContent));
  const [loading, setLoading] = useState(!siteContentLoaded);
  const [error, setError] = useState('');

  const reload = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const nextContent = await fetchSiteContent({ force });
      setSiteContent(nextContent || emptySiteContent);
    } catch (err) {
      setError(err.message || 'Unable to load site content.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (siteContentLoaded) {
      setSiteContent(cachedSiteContent);
      setLoading(false);
      return undefined;
    }

    (async () => {
      setLoading(true);
      try {
        const nextContent = await fetchSiteContent();
        if (!cancelled) {
          setSiteContent(nextContent || emptySiteContent);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to load site content.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      siteContent,
      siteContentLoading: loading,
      siteContentError: error,
      reloadSiteContent: () => reload({ force: true })
    }),
    [error, loading, reload, siteContent]
  );

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  const context = useContext(SiteContentContext);
  if (!context) {
    throw new Error('useSiteContent must be used inside SiteContentProvider.');
  }
  return context;
}
