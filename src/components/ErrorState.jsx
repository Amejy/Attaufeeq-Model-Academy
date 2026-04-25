function ErrorState({
  title = 'Something went wrong',
  message = 'We could not complete that request right now. Please try again.',
  onRetry,
  compact = false,
  className = ''
}) {
  return (
    <section
      className={`error-state ${compact ? 'error-state--compact' : ''} ${className}`.trim()}
      role="alert"
    >
      <div className="error-state__badge">System notice</div>
      <h2 className="error-state__title">{title}</h2>
      <p className="error-state__message">{message}</p>
      {typeof onRetry === 'function' && (
        <button type="button" onClick={onRetry} className="interactive-button error-state__action">
          Retry
        </button>
      )}
    </section>
  );
}

export default ErrorState;
