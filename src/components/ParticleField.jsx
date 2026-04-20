import { memo, useEffect, useMemo, useState } from 'react';

const particles = [
  { left: '6%', top: '14%', size: 6, delay: '0s', duration: '14s' },
  { left: '14%', top: '68%', size: 8, delay: '-3s', duration: '18s' },
  { left: '22%', top: '34%', size: 10, delay: '-8s', duration: '20s' },
  { left: '34%', top: '18%', size: 7, delay: '-5s', duration: '16s' },
  { left: '42%', top: '72%', size: 9, delay: '-2s', duration: '19s' },
  { left: '56%', top: '24%', size: 12, delay: '-11s', duration: '23s' },
  { left: '64%', top: '58%', size: 7, delay: '-4s', duration: '15s' },
  { left: '72%', top: '12%', size: 9, delay: '-7s', duration: '21s' },
  { left: '82%', top: '44%', size: 11, delay: '-9s', duration: '17s' },
  { left: '90%', top: '76%', size: 6, delay: '-1s', duration: '14s' },
  { left: '48%', top: '8%', size: 5, delay: '-6s', duration: '12s' },
  { left: '78%', top: '84%', size: 8, delay: '-13s', duration: '22s' }
];

function ParticleField({ variant = 'public' }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 1024px), (prefers-reduced-motion: reduce)');
    const updateVisibility = () => {
      setEnabled(!mediaQuery.matches);
    };

    updateVisibility();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateVisibility);
      return () => mediaQuery.removeEventListener('change', updateVisibility);
    }

    mediaQuery.addListener(updateVisibility);
    return () => mediaQuery.removeListener(updateVisibility);
  }, []);

  const activeParticles = useMemo(
    () => (variant === 'portal' ? particles.slice(0, 8) : particles),
    [variant]
  );

  if (!enabled) {
    return null;
  }

  return (
    <div className={`particle-field particle-field--${variant}`} aria-hidden="true">
      {activeParticles.map((particle, index) => (
        <span
          key={`${variant}-${index}`}
          className="particle-field__dot"
          style={{
            left: particle.left,
            top: particle.top,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            animationDelay: particle.delay,
            animationDuration: particle.duration
          }}
        />
      ))}
    </div>
  );
}

export default memo(ParticleField);
