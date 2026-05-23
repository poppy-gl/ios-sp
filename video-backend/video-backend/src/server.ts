import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cron from 'node-cron';
import { registerVideoRoutes } from './routes/videos.js';
import { runCrawlJob } from './jobs/crawlJob.js';

const app = Fastify({ logger: true });

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
  return { ok: true, saved };
});

await registerVideoRoutes(app);

cron.schedule('*/30 * * * *', () => {
  runCrawlJob().catch((error) => app.log.error(error));
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: '127.0.0.1', port });
