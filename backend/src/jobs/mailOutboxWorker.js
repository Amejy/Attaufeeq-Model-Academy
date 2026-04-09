import { processPendingMailOutbox } from '../services/credentialDeliveryService.js';

export function startMailOutboxWorker({ intervalMs = 5000, batchSize = 10 } = {}) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      await processPendingMailOutbox({ limit: batchSize });
    } catch (error) {
      console.error('Mail outbox worker error:', error.message || error);
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, Math.max(1000, Number(intervalMs || 5000)));

  timer.unref?.();
  void tick();

  return () => clearInterval(timer);
}
