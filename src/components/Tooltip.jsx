import { createElement } from 'react';

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

  return createElement(
    As,
    {
      className: `tooltip-anchor ${className}`.trim(),
      'data-tooltip': canShowTooltip ? tooltipText : undefined,
      ...props
    },
    children
  );
}

export default Tooltip;
