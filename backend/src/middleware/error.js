export function notFoundHandler(_req, res) {
  return res.status(404).json({ success: false, message: 'Route not found.' });
}

export function errorHandler(err, _req, res) {
  const status = err.status || 500;
  if (status >= 500) {
    // Log internal errors without leaking details to clients.
    console.error(err);
  }
  const message = status >= 500 ? 'Internal server error.' : err.message || 'Bad request.';
  return res.status(status).json({ success: false, message });
}
