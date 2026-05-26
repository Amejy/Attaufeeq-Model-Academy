const startupState = {
  ready: false,
  failed: false,
  message: 'Backend services are starting.',
  updatedAt: new Date().toISOString()
};

function updateState(next) {
  Object.assign(startupState, next, { updatedAt: new Date().toISOString() });
}

export function markStartupInitializing(message = 'Backend services are starting.') {
  updateState({
    ready: false,
    failed: false,
    message
  });
}

export function markStartupReady(message = 'Backend services are ready.') {
  updateState({
    ready: true,
    failed: false,
    message
  });
}

export function markStartupFailed(message = 'Backend services failed to start.') {
  updateState({
    ready: false,
    failed: true,
    message
  });
}

export function getStartupState() {
  return { ...startupState };
}
