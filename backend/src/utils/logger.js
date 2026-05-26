import process from 'node:process';

function normalizeError(error) {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: typeof error === 'string' ? error : JSON.stringify(error)
  };
}

function write(level, message, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: String(message || '')
  };

  if (context && typeof context === 'object') {
    const normalized = { ...context };
    if ('error' in normalized) {
      normalized.error = normalizeError(normalized.error);
    }
    entry.context = normalized;
  }

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

export const logger = {
  log(message, context) {
    write('info', message, context);
  },
  info(message, context) {
    write('info', message, context);
  },
  warn(message, context) {
    write('warn', message, context);
  },
  error(message, context) {
    if (message instanceof Error && context === undefined) {
      write('error', message.message, { error: message });
      return;
    }
    write('error', message, context);
  }
};
