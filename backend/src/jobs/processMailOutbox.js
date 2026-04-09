import process from 'node:process';
import { testDbConnection } from '../db/client.js';
import { processPendingMailOutbox } from '../services/credentialDeliveryService.js';

async function run() {
  await testDbConnection();
  const summary = await processPendingMailOutbox({ limit: 50 });
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
