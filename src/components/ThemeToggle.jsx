import useTheme from '../context/useTheme';

function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle ${className}`.trim()}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span className="theme-toggle__track">
        <span className="theme-toggle__thumb" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.18em]">
        {isDark ? 'Dark' : 'Light'}
      </span>
    </button>
  );
}

export default ThemeToggle;
