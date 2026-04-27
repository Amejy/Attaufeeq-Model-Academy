import { useState } from 'react';
import { resolveApiBaseUrl } from '../utils/apiBase';

const API_BASE_URL = resolveApiBaseUrl();
const LEGACY_IMAGE_ALIASES = {
  '/images/campus.jpg': '/images/schoolwebsite1.png',
  '/images/classroom.jpg': '/images/schoolweb2.png',
  '/images/students.jpg': '/images/schoolweb3.png',
  '/images/community.jpg': '/images/schoolweb4.png',
  '/images/hero-school.jpg': '/images/schoolwebsite1.png',
  '/images/islamic-class.jpg': '/images/gallery5.png',
};
const FALLBACK_IMAGE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23edf6f0'/%3E%3Cpath d='M0 640L180 500l160 80 220-210 170 120 180-160 290 310V800H0Z' fill='%23cfe6d4'/%3E%3Ccircle cx='930' cy='190' r='72' fill='%23d9b354' fill-opacity='.72'/%3E%3Ctext x='80' y='126' font-family='Arial,sans-serif' font-size='48' font-weight='700' fill='%230f5132'%3EATTAUFEEQ%3C/text%3E%3Ctext x='80' y='180' font-family='Arial,sans-serif' font-size='28' fill='%23556b60'%3EImage unavailable%3C/text%3E%3C/svg%3E";

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function resolveAgainstApiBase(pathname) {
  const normalizedBase = normalizeBaseUrl(API_BASE_URL);
  if (!normalizedBase || normalizedBase === '/api') {
    return pathname;
  }
  if (/^https?:\/\//i.test(normalizedBase)) {
    return `${normalizedBase}${pathname}`;
  }
  return `${normalizedBase}${pathname}`;
}

function resolveImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (LEGACY_IMAGE_ALIASES[value]) {
    return LEGACY_IMAGE_ALIASES[value];
  }
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/api/uploads/')) {
    return resolveAgainstApiBase(value);
  }
  if (value.startsWith('/uploads/')) {
    return resolveAgainstApiBase(`/api${value}`);
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
  const resolvedPrimarySrc = resolveImageSrc(src);
  const resolvedFallbackSrc = resolveImageSrc(fallbackSrc);
  const sourceKey = `${resolvedPrimarySrc}::${resolvedFallbackSrc}`;
  const [failedSourcesByKey, setFailedSourcesByKey] = useState({});
  const failedSources = failedSourcesByKey[sourceKey] || [];
  const currentSrc = [resolvedPrimarySrc, resolvedFallbackSrc, FALLBACK_IMAGE_DATA_URL].find(
    (candidate) => candidate && !failedSources.includes(candidate)
  ) || FALLBACK_IMAGE_DATA_URL;

  return (
    <img
      {...rest}
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => {
        setFailedSourcesByKey((prev) => {
          const currentFailed = prev[sourceKey] || [];
          if (currentFailed.includes(currentSrc)) {
            return prev;
          }
          return {
            ...prev,
            [sourceKey]: [...currentFailed, currentSrc]
          };
        });
      }}
    />
  );
}

export default SmartImage;
