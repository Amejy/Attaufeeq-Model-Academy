import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SmartImage from './SmartImage';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

function FeatureGlyph({ iconLabel }) {
  return (
    <div className="feature-card__glyph" aria-hidden="true">
      <span>{String(iconLabel || 'FC').slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

function ImageLightbox({ image, alt, title, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [onClose]);

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={title || alt || 'Image preview'}>
      <button type="button" className="image-lightbox__backdrop" onClick={onClose} aria-label="Close image preview" />
      <div className="image-lightbox__panel">
        <button type="button" className="image-lightbox__close" onClick={onClose} aria-label="Close image preview">
          Close
        </button>
        <SmartImage
          src={image}
          fallbackSrc={DEFAULT_IMAGES.classroom}
          alt={alt || title}
          className="image-lightbox__image"
          loading="eager"
        />
        {title ? <p className="image-lightbox__caption">{title}</p> : null}
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  text,
  description,
  image,
  imageAlt,
  iconLabel,
  ctaLabel,
  ctaTo,
  featured = false,
  mediaClassName = '',
  className = '',
  accent = 'emerald'
}) {
  const bodyText = description || text;
  const hasMedia = Boolean(image);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const cardClasses = joinClasses(
    'feature-card interactive-card min-w-0 overflow-hidden',
    featured && 'feature-card--featured',
    accent && `feature-card--${accent}`,
    className
  );

  return (
    <>
      <article className={cardClasses}>
        <div className={joinClasses('feature-card__media', featured && 'feature-card__media--featured', mediaClassName)}>
          {hasMedia ? (
            <button
              type="button"
              className="feature-card__media-button"
              onClick={() => setIsPreviewOpen(true)}
              aria-label={`View ${title}`}
            >
              <SmartImage
                src={image}
                fallbackSrc={DEFAULT_IMAGES.classroom}
                alt={imageAlt || title}
                className="feature-card__image"
                loading="lazy"
              />
              <span className="feature-card__zoom">View image</span>
            </button>
          ) : (
            <FeatureGlyph iconLabel={iconLabel || title} />
          )}
        </div>

        <div className="feature-card__content">
          <div className="space-y-3">
            <h3 className="feature-card__title">{title}</h3>
            {bodyText ? <p className="feature-card__description">{bodyText}</p> : null}
          </div>

          {ctaLabel && ctaTo ? (
            <Link to={ctaTo} className="feature-card__cta">
              {ctaLabel}
            </Link>
          ) : ctaLabel ? (
            <span className="feature-card__cta">{ctaLabel}</span>
          ) : null}
        </div>
      </article>

      {hasMedia && isPreviewOpen ? (
        <ImageLightbox
          image={image}
          alt={imageAlt || title}
          title={title}
          onClose={() => setIsPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

export default FeatureCard;
