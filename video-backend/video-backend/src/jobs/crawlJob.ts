import { toAppVideoItem } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';
import {
  crawlVideos,
  getVideoIdFromDetailUrl,
  type CrawledVideo,
  type CrawlDetailEntry,
} from '../services/crawler.js';

const getPositiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const UNLIMITED_CRAWL_LIMIT = Number.MAX_SAFE_INTEGER;
const SKIP_EXISTING_HOURS = getPositiveNumber(process.env.CRAWL_SKIP_EXISTING_HOURS, 72);

function toDbPayload(video: CrawledVideo) {
  const appVideo = toAppVideoItem(video);

  return {
    title: appVideo.title,
    description: appVideo.description ?? null,
    cover: appVideo.cover ?? null,
    source: appVideo.source,
    sourceType: appVideo.sourceType,
    category: appVideo.category,
    subCategory: appVideo.subCategory ?? null,
    provider: appVideo.provider ?? null,
    seriesId: appVideo.seriesId ?? null,
    rawJson: JSON.stringify(appVideo),
  };
}

const getSavePriority = (video: CrawledVideo) => {
  if (video.subCategory === '国产剧') return 4000;
  if (video.subCategory === '韩剧') return 3000;
  if (video.category === '电视剧') return 2000;

  return 1000;
};

export async function runCrawlJob() {
  const maxVideos = getPositiveNumber(process.env.CRAWL_MAX_VIDEOS, UNLIMITED_CRAWL_LIMIT);
  const freshCutoff = new Date(Date.now() - SKIP_EXISTING_HOURS * 60 * 60 * 1000);
  const shouldSkipDetail = async (entry: CrawlDetailEntry) => {
    const videoId = getVideoIdFromDetailUrl(entry.url);

    if (!videoId || SKIP_EXISTING_HOURS <= 0) {
      return false;
    }

    const existing = await prisma.video.findUnique({
      select: { updatedAt: true },
      where: { id: videoId },
    });

    return Boolean(existing && existing.updatedAt >= freshCutoff);
  };
  const videos = await crawlVideos(maxVideos, { shouldSkipDetail });
  const orderedVideos = videos
    .map((video, index) => ({ index, video }))
    .sort(
      (first, second) =>
        getSavePriority(second.video) - getSavePriority(first.video) || first.index - second.index,
    )
    .map((item) => item.video);

  let saved = 0;

  for (const video of orderedVideos) {
    const payload = toDbPayload(video);

    await prisma.video.upsert({
      where: { id: video.id },
      create: {
        id: video.id,
        ...payload,
      },
      update: payload,
    });

    saved += 1;
  }

  console.log(`[crawler] saved ${saved} videos`);
  return saved;
}

const currentFile = process.argv[1]?.replace(/\\/g, '/') ?? '';

if (currentFile.endsWith('/crawlJob.ts') || currentFile.endsWith('/crawlJob.js')) {
  runCrawlJob()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
