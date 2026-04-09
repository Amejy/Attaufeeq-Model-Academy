/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

export function SiteContentProvider({ children }) {
  const [siteContent, setSiteContent] = useState(emptySiteContent);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson('/site-content');
      setSiteContent(data.content || emptySiteContent);
    } catch (err) {
      setError(err.message || 'Unable to load site content.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const value = useMemo(
    () => ({
      siteContent,
      siteContentLoading: loading,
      siteContentError: error,
      reloadSiteContent: reload
    }),
    [error, loading, siteContent]
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
