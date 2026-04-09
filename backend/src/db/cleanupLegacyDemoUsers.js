import process from 'node:process';
import { closeDbPool, testDbConnection } from './client.js';
import { cleanupLegacyDemoUsers } from '../services/authBootstrapService.js';

async function run() {
  await testDbConnection();
  const summary = await cleanupLegacyDemoUsers({
    dryRun: String(process.env.DRY_RUN || 'false').toLowerCase() === 'true'
  });
  console.log(JSON.stringify(summary, null, 2));
}

run()
  .then(async () => {
    await closeDbPool();
  })
  .catch(async (error) => {
    console.error(error.message || error);
    await closeDbPool();
    process.exit(1);
  });
