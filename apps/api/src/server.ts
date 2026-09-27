import { app } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';

const server = app.listen(env.PORT, () => {
  console.info(`ERP API listening on port ${env.PORT} (${env.NODE_ENV}).`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down the ERP API.`);
  server.close(async (error) => {
    await prisma.$disconnect();
    if (error) {
      console.error('The HTTP server did not close cleanly.', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
