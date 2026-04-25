import Tooltip from './Tooltip';

function PasswordField({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
  showPassword = false,
  onToggleVisibility,
  className = 'form-field w-full pr-20 text-sm',
  autoComplete,
  error = '',
  onBlur,
  helperText = ''
}) {
  return (
    <label className="field-shell block text-sm">
      <span className="field-label">{label}</span>
      <div className="relative">
        <input
          name={name}
          type={showPassword ? 'text' : 'password'}
          required={required}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className={className}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <Tooltip text={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>
          <button
            type="button"
            onClick={onToggleVisibility}
            className="interactive-button absolute inset-y-1.5 right-2 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            title={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </Tooltip>
      </div>
      {error ? <p className="field-error">{error}</p> : helperText ? <p className="field-help">{helperText}</p> : null}
    </label>
  );
}

export default PasswordField;
