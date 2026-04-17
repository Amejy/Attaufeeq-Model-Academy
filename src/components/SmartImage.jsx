import { useState } from 'react';

function SmartImage({
  src,
  fallbackSrc = '',
  alt = '',
  className = '',
  loading = 'lazy',
  ...rest
}) {
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc || '');
  const [hidden, setHidden] = useState(false);

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
