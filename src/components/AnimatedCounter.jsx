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

  useEffect(() => {
    if (!parsed) {
      return undefined;
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
  }, [duration, parsed, value]);

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
