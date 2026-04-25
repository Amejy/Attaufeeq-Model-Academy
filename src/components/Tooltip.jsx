import { createElement, useEffect, useRef, useState } from 'react';

function Tooltip({
  as: As = 'span',
  text,
  className = '',
  disabled = false,
  children,
  ...props
}) {
  const tooltipText = String(text || '').trim();
  const canShowTooltip = Boolean(tooltipText) && !disabled;
  const [visible, setVisible] = useState(false);
  const longPressTimerRef = useRef(null);

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  function clearLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handlePointerDown(event) {
    if (!canShowTooltip || event.pointerType !== 'touch') return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      setVisible(true);
      longPressTimerRef.current = null;
    }, 450);
  }

  function handlePointerUp(event) {
    if (event.pointerType === 'touch') {
      clearLongPress();
      window.setTimeout(() => setVisible(false), 1200);
    }
  }

  return createElement(
    As,
    {
      className: `tooltip-anchor ${className}`.trim(),
      'data-tooltip': canShowTooltip ? tooltipText : undefined,
      'data-tooltip-visible': visible ? 'true' : undefined,
      title: canShowTooltip ? tooltipText : undefined,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerCancel: clearLongPress,
      onPointerLeave: clearLongPress,
      ...props
    },
    children
  );
}

export default Tooltip;
