import { useEffect, useState } from 'react';
import { resolveApiBaseUrl } from '../utils/apiBase';

const API_BASE_URL = resolveApiBaseUrl();

function resolveImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/api/')) {
    return API_BASE_URL ? `${API_BASE_URL}${value.replace(/^\/api/, '')}` : value;
  }
  return value;
}

function SmartImage({
  src,
  fallbackSrc = '',
  alt = '',
  className = '',
  loading = 'lazy',
  ...rest
}) {
  const [currentSrc, setCurrentSrc] = useState(resolveImageSrc(src) || resolveImageSrc(fallbackSrc) || '');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const nextSrc = resolveImageSrc(src) || resolveImageSrc(fallbackSrc) || '';
    if (nextSrc === currentSrc && !hidden) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      setCurrentSrc(nextSrc);
      setHidden(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [src, fallbackSrc, currentSrc, hidden]);

  if (!currentSrc || hidden) {
    return null;
  }

  return (
    <img
      {...rest}
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
          return;
        }
        setHidden(true);
      }}
    />
  );
}

export default SmartImage;
