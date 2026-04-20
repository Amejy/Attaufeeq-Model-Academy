import { useEffect, useMemo, useState } from 'react';

function parseNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { number: value, prefix: '', suffix: '' };
  }

  const match = String(value).trim().match(/^([^0-9-]*)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  return {
    prefix: match[1] || '',
    number: Number(match[2]),
    suffix: match[3] || ''
  };
}

function AnimatedCounter({ value, duration = 900 }) {
  const parsed = useMemo(() => parseNumericValue(value), [value]);
  const [displayValue, setDisplayValue] = useState(parsed ? 0 : value);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncPreference);
      return () => mediaQuery.removeEventListener('change', syncPreference);
    }

    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, []);

  useEffect(() => {
    if (!parsed) {
      return undefined;
    }

    if (prefersReducedMotion || duration <= 0) {
      const frameId = window.requestAnimationFrame(() => {
        setDisplayValue(parsed.number);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const startTime = performance.now();
    let frameId = 0;

    function update(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const currentNumber = parsed.number * eased;
      setDisplayValue(currentNumber);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(update);
      }
    }

    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, parsed, prefersReducedMotion, value]);

  if (!parsed) return <>{value}</>;

  const formattedNumber = Number.isInteger(parsed.number)
    ? Math.round(Number(displayValue)).toLocaleString()
    : Number(displayValue).toFixed(1);

  return (
    <>
      {parsed.prefix}
      {formattedNumber}
      {parsed.suffix}
    </>
  );
}

export default AnimatedCounter;
