import process from 'node:process';
import { closeDbPool } from './client.js';
import { runMigrations } from './migrationRunner.js';

runMigrations({ logger: console })
  .then(async () => {
    await closeDbPool();
  })
  .catch(async (error) => {
    console.error(error.message || error);
    await closeDbPool();
    process.exit(1);
  });
