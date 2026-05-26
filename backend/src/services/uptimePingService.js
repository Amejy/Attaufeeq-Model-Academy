import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingOnce() {
  if (!env.uptimePingUrl) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.uptimePingTimeoutMs);
    await fetch(env.uptimePingUrl, {
      method: env.uptimePingMethod,
      headers: { 'User-Agent': 'attaufiqschools-backend' },
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (error) {
    logger.warn('Uptime ping failed.', { error });
  }
}

export function startUptimePinger() {
  if (!env.uptimePingUrl) return () => {};
  let active = true;

  async function loop() {
    while (active) {
      await pingOnce();
      await sleep(env.uptimePingIntervalMs);
    }
  }

  loop().catch((error) => {
    logger.warn('Uptime ping loop stopped.', { error });
  });

  return () => {
    active = false;
  };
}
