import { Router } from 'express';
import { getLivenessStatus, getReadinessStatus } from '../services/healthService.js';

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  return res.json(getLivenessStatus());
});

healthRouter.get('/live', (_req, res) => {
  return res.json(getLivenessStatus());
});

healthRouter.get('/ready', async (_req, res) => {
  const status = await getReadinessStatus();
  return res.status(status.ready ? 200 : 503).json(status);
});

export default healthRouter;
