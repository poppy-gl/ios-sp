import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cron from 'node-cron';
import { clearVideoApiCaches, registerVideoRoutes, warmVideoListCaches } from './routes/videos.js';
import { runCrawlJob } from './jobs/crawlJob.js';

const app = Fastify({ logger: true });
const enableInProcessCrawlCron = process.env.ENABLE_IN_PROCESS_CRAWL_CRON === 'true';
const inProcessCrawlCronSchedule = process.env.IN_PROCESS_CRAWL_CRON_SCHEDULE ?? '*/30 * * * *';

await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/api/health', async () => ({
  ok: true,
  updatedAt: new Date().toISOString(),
}));

app.post('/api/admin/crawl', async (request, reply) => {
  const expected = process.env.ADMIN_TOKEN;

  if (expected && request.headers.authorization !== `Bearer ${expected}`) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }

  const saved = await runCrawlJob();
  clearVideoApiCaches();
  await warmVideoListCaches();
  return { ok: true, saved };
});

await registerVideoRoutes(app);
void warmVideoListCaches().catch((error) => app.log.warn(error, 'video list cache warmup failed'));

if (enableInProcessCrawlCron) {
  cron.schedule(inProcessCrawlCronSchedule, () => {
    runCrawlJob()
      .then(async () => {
        clearVideoApiCaches();
        await warmVideoListCaches();
      })
      .catch((error) => app.log.error(error));
  });
} else {
  app.log.info('In-process crawl cron is disabled.');
}

const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: '127.0.0.1', port });
