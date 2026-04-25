import useTheme from '../context/useTheme';
import Tooltip from './Tooltip';

function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <Tooltip text={label}>
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-toggle interactive-button ${className}`.trim()}
        aria-label={label}
        title={label}
      >
        <span className="theme-toggle__track">
          <span className="theme-toggle__thumb" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">
          {isDark ? 'Dark' : 'Light'}
        </span>
      </button>
    </Tooltip>
  );
}

export default ThemeToggle;
