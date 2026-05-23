import type { FastifyInstance } from 'fastify';
import { toAppVideoItem } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';
import { resolveEpisode } from '../services/resolveEpisode.js';

type StoredVideoRow = {
  id: string;
  title: string;
  description: string | null;
  cover: string | null;
  source: string;
  sourceType: string;
  category: string;
  subCategory: string | null;
  provider: string | null;
  seriesId: string | null;
  rawJson: string;
};

const parseStoredVideo = (row: StoredVideoRow) => {
  try {
    return toAppVideoItem(JSON.parse(row.rawJson));
  } catch {
    return toAppVideoItem({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      cover: row.cover ?? undefined,
      source: row.source,
      sourceType: row.sourceType,
      category: row.category,
      subCategory: row.subCategory ?? undefined,
      provider: row.provider ?? undefined,
      seriesId: row.seriesId ?? undefined,
    });
  }
};

export async function registerVideoRoutes(app: FastifyInstance) {
  app.get('/api/videos', async (request) => {
    const query = request.query as { page?: string; pageSize?: string; category?: string };
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 30), 1), 200);
    const category = query.category?.trim();

    const rows = await prisma.video.findMany({
      ...(category
        ? {
            where: {
              OR: [{ category }, { subCategory: category }],
            },
          }
        : {}),
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items: rows.map((row: StoredVideoRow) => parseStoredVideo(row)) };
  });

  app.get('/api/videos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row =
      (await prisma.video.findUnique({ where: { id } })) ??
      (await prisma.video.findFirst({
        where: {
          seriesId: id,
        },
      }));

    if (!row) {
      return reply.code(404).send({ message: 'Video not found' });
    }

    return { item: parseStoredVideo(row as StoredVideoRow) };
  });

  app.get('/api/search', async (request) => {
    const { q } = request.query as { q?: string };
    const keyword = (q ?? '').trim();

    if (!keyword) {
      return { items: [] };
    }

    const rows = await prisma.video.findMany({
      where: {
        OR: [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
          { category: { contains: keyword } },
          { subCategory: { contains: keyword } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });

    return { items: rows.map((row: StoredVideoRow) => parseStoredVideo(row)) };
  });

  app.post('/api/resolve', async (request) => {
    return resolveEpisode(
      request.body as {
        videoId: string;
        line: number;
        episode: number;
        playPageUrl?: string;
      },
    );
  });
}
