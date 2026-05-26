import { useState } from 'react';
import { resolveAssetUrl } from '../utils/assetUrl';

const LEGACY_IMAGE_ALIASES = {
  '/images/campus.jpg': '/images/schoolwebsite/main%20image%20(6).png',
  '/images/classroom.jpg': '/images/schoolwebsite/Pasted%20image%20(2).png',
  '/images/students.jpg': '/images/Home/Pasted%20image%20(2).png',
  '/images/community.jpg': '/images/contact/main%20image%20(2).png',
  '/images/hero-school.jpg': '/images/schoolwebsite/main%20image%20(6).png',
  '/images/islamic-class.jpg': '/images/madrasawebsite/main%20image.png',
  '/images/schoolwebsite1.png': '/images/schoolwebsite/main%20image%20(6).png',
  '/images/schoolweb2.png': '/images/schoolwebsite/Pasted%20image%20(2).png',
  '/images/schoolweb3.png': '/images/Home/Pasted%20image%20(2).png',
  '/images/schoolweb4.png': '/images/contact/main%20image%20(2).png',
  '/images/gallery1.png': '/images/gallery/main%20image%20(16).png',
  '/images/gallery2.png': '/images/gallery/Pasted%20image.png',
  '/images/gallery3.png': '/images/gallery/Pasted%20image%20(2).png',
  '/images/gallery4.png': '/images/gallery/Pasted%20image%20(3).png',
  '/images/gallery5.png': '/images/madrasawebsite/main%20image.png',
};
const FALLBACK_IMAGE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23edf6f0'/%3E%3Cpath d='M0 640L180 500l160 80 220-210 170 120 180-160 290 310V800H0Z' fill='%23cfe6d4'/%3E%3Ccircle cx='930' cy='190' r='72' fill='%23d9b354' fill-opacity='.72'/%3E%3Ctext x='80' y='126' font-family='Arial,sans-serif' font-size='48' font-weight='700' fill='%230f5132'%3EATTAUFEEQ%3C/text%3E%3Ctext x='80' y='180' font-family='Arial,sans-serif' font-size='28' fill='%23556b60'%3EImage unavailable%3C/text%3E%3C/svg%3E";

function resolveImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (LEGACY_IMAGE_ALIASES[value]) {
    return LEGACY_IMAGE_ALIASES[value];
  }
  return resolveAssetUrl(value);
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
