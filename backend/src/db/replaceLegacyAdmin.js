import process from 'node:process';
import { closeDbPool, testDbConnection } from './client.js';
import { replaceLegacyAdminWithBootstrap } from '../services/authBootstrapService.js';

async function run() {
  await testDbConnection();
  const summary = await replaceLegacyAdminWithBootstrap();
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
