import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import SmartImage from '../SmartImage';

const textContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12
    }
  }
};

const textItem = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

export function PremiumHero({
  badge,
  title,
  description,
  primaryAction,
  secondaryAction,
  image,
  imageAlt,
  accent = 'school',
  stats = [],
  kicker,
  children
}) {
  return (
    <section className="section-wrap py-6 sm:py-8 lg:py-10" data-aos="fade-up">
      <div className={joinClasses('premium-hero', accent === 'madrasa' ? 'premium-hero--madrasa' : 'premium-hero--school')}>
        <div className="premium-hero__backdrop" />
        <div className="premium-hero__mesh" />
        <div className="premium-hero__grid">
          <motion.div
            className="premium-hero__copy"
            variants={textContainer}
            initial="hidden"
            animate="show"
          >
            {badge ? <motion.p variants={textItem} className="premium-hero__badge">{badge}</motion.p> : null}
            <motion.h1 variants={textItem} className="premium-hero__title">{title}</motion.h1>
            {kicker ? <motion.p variants={textItem} className="premium-hero__kicker">{kicker}</motion.p> : null}
            {description ? <motion.p variants={textItem} className="premium-hero__description">{description}</motion.p> : null}
            {(primaryAction || secondaryAction) && (
              <motion.div variants={textItem} className="premium-hero__actions">
                {primaryAction ? (
                  <Link to={primaryAction.to} className="premium-button premium-button--primary">
                    {primaryAction.label}
                  </Link>
                ) : null}
                {secondaryAction ? (
                  <Link to={secondaryAction.to} className="premium-button premium-button--ghost">
                    {secondaryAction.label}
                  </Link>
                ) : null}
              </motion.div>
            )}
            {children}
          </motion.div>

          <motion.div
            className="premium-hero__visual"
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="premium-hero__stack">
              <motion.div
                className="premium-hero__image-shell"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 16, ease: 'easeInOut', repeat: Infinity }}
              >
                <div className="premium-hero__image-mask">
                  <div className="premium-hero__image-overlay" />
                  <SmartImage
                    src={image}
                    fallbackSrc={image}
                    alt={imageAlt}
                    className="premium-hero__image"
                    loading="eager"
                  />
                </div>
              </motion.div>

              {stats.length ? (
                <div className="premium-hero__metric-strip">
                  {stats.slice(0, 3).map((item) => (
                    <div key={item.title} className="premium-hero__metric">
                      <p className="premium-hero__metric-value">{item.value}</p>
                      <p className="premium-hero__metric-title">{item.title}</p>
                      <p className="premium-hero__metric-text">{item.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function SectionIntro({ eyebrow, title, description, align = 'left' }) {
  return (
    <div
      data-aos="fade-up"
      className={joinClasses('premium-section-intro', align === 'center' && 'premium-section-intro--center')}
    >
      {eyebrow ? <p className="premium-section-intro__eyebrow">{eyebrow}</p> : null}
      <h2 className="premium-section-intro__title">{title}</h2>
      {description ? <p className="premium-section-intro__description">{description}</p> : null}
    </div>
  );
}

export function GlassPanel({ className = '', children, aos = 'fade-up' }) {
  return (
    <div data-aos={aos} className={joinClasses('premium-glass', className)}>
      {children}
    </div>
  );
}

export function IdentityCard({ title, badge, description, to, image, imageAlt, accent = 'school' }) {
  return (
    <Link
      to={to}
      data-aos="fade-up"
      className={joinClasses('identity-card', accent === 'madrasa' ? 'identity-card--madrasa' : 'identity-card--school')}
    >
      <div className="identity-card__media">
        <div className="identity-card__overlay" />
        <SmartImage
          src={image}
          fallbackSrc={image}
          alt={imageAlt || title}
          className="identity-card__image"
          loading="lazy"
        />
      </div>
      <div className="identity-card__body">
        {badge ? <p className="identity-card__badge">{badge}</p> : null}
        <h3 className="identity-card__title">{title}</h3>
        <p className="identity-card__description">{description}</p>
        <span className="identity-card__cta">Open experience</span>
      </div>
    </Link>
  );
}

export function LiveTicker({ items = [], accent = 'school' }) {
  const tickerItems = items.length ? items : ['Admissions', 'Results', 'Announcements', 'Events'];
  const loopItems = [...tickerItems, ...tickerItems];

  return (
    <div className={joinClasses('live-ticker', accent === 'madrasa' ? 'live-ticker--madrasa' : 'live-ticker--school')} data-aos="fade-up">
      <div className="live-ticker__track">
        {loopItems.map((item, index) => (
          <span key={`${item}-${index}`} className="live-ticker__item">
            <span className="live-ticker__dot" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
