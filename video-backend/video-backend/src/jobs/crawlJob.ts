import { toAppVideoItem } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';
import { crawlVideos, type CrawledVideo } from '../services/crawler.js';

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

export async function runCrawlJob() {
  const maxVideos = Number(process.env.CRAWL_MAX_VIDEOS ?? Number.MAX_SAFE_INTEGER);
  const videos = await crawlVideos(maxVideos);

  let saved = 0;

  for (const video of videos) {
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
