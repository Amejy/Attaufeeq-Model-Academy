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
  const cardClasses = joinClasses(
    'feature-card interactive-card min-w-0 overflow-hidden',
    featured && 'feature-card--featured',
    accent && `feature-card--${accent}`,
    className
  );

  return (
    <article className={cardClasses}>
      <div className={joinClasses('feature-card__media', featured && 'feature-card__media--featured', mediaClassName)}>
        {hasMedia ? (
          <SmartImage
            src={image}
            fallbackSrc={DEFAULT_IMAGES.classroom}
            alt={imageAlt || title}
            className="feature-card__image"
            loading="lazy"
          />
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
  );
}

export default FeatureCard;
