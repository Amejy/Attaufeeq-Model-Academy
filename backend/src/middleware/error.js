import { toPublicErrorMessage } from '../utils/publicError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(_req, res) {
  return res.status(404).json({ success: false, message: 'The requested page could not be found.' });
}

export function errorHandler(err, _req, res) {
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'The selected file is too large. Please choose a smaller file and try again.'
      : 'The file upload could not be completed. Please review the file and try again.';
    return res.status(400).json({ success: false, message });
  }

  const status = err.status || 500;
  if (status >= 500) {
    logger.error('Request failed with an internal server error.', { error: err, status });
  }
  const message = toPublicErrorMessage(err, 'We could not process that request.', status);
  return res.status(status).json({ success: false, message });
}
