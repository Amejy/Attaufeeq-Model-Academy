import Tooltip from './Tooltip';

function EyeOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M10.6 5.2A11.5 11.5 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M6.7 6.8C4 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.3-.4 4.7-1.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.9 9.9A3 3 0 0 0 14.1 14.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

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
            className="interactive-button absolute inset-y-1.5 right-2 inline-flex items-center justify-center rounded-full px-3 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            title={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          >
            {showPassword ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </button>
        </Tooltip>
      </div>
      {error ? <p className="field-error">{error}</p> : helperText ? <p className="field-help">{helperText}</p> : null}
    </label>
  );
}

export default PasswordField;
