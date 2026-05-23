import { toAppVideoItem } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';

const video = toAppVideoItem({
  id: 'test-video-001',
  title: '后端测试视频',
  source: 'https://example.com/play/test-1-1.html',
  sourceType: 'unsupported',
  category: '电视剧',
  subCategory: '韩剧',
  provider: '测试后端',
  playableInApp: false,
  unsupportedReason: '需要通过 /api/resolve 懒解析播放地址',
  description: '这是一条用于测试 App 后端连接的视频。',
  playLines: [
    {
      line: 1,
      label: '线路 1',
      episodes: [
        {
          episode: 1,
          episodeLabel: '第1集',
          playPageUrl: 'https://example.com/play/test-1-1.html',
        },
      ],
    },
  ],
});
const payload = {
  title: video.title,
  description: video.description ?? null,
  cover: video.cover ?? null,
  source: video.source,
  sourceType: video.sourceType,
  category: video.category,
  subCategory: video.subCategory ?? null,
  provider: video.provider ?? null,
  seriesId: video.seriesId ?? null,
  rawJson: JSON.stringify(video),
};

await prisma.video.upsert({
  where: { id: video.id },
  create: {
    id: video.id,
    ...payload,
  },
  update: payload,
});

console.log('Seeded test video');
await prisma.$disconnect();
