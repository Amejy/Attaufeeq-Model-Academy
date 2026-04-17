function PasswordField({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
  showPassword = false,
  onToggleVisibility,
  className = 'w-full rounded-md border border-slate-300 px-3 py-2 pr-16',
  autoComplete,
  error = '',
  onBlur
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
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
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute inset-y-1.5 right-2 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          aria-label={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}

export default PasswordField;
