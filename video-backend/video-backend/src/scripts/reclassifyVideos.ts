import { toAppVideoItem } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';
import { normalizeVideoCategoryFields } from '../services/categoryClassifier.js';

type StoredVideoRow = {
  category: string;
  cover: string | null;
  description: string | null;
  id: string;
  provider: string | null;
  rawJson: string;
  seriesId: string | null;
  source: string;
  sourceType: string;
  subCategory: string | null;
  title: string;
};

const BATCH_SIZE = Number(process.env.RECLASSIFY_BATCH_SIZE ?? 500);

const parseRawJson = (value: string) => {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const toVideoItem = (row: StoredVideoRow) => {
  const raw = parseRawJson(row.rawJson);

  return toAppVideoItem({
    ...raw,
    id: row.id,
    title: row.title,
    description: row.description ?? raw.description,
    cover: row.cover ?? raw.cover,
    rawCategory: row.subCategory ?? raw.rawCategory,
    source: row.source,
    sourceType: row.sourceType,
    category: row.category,
    subCategory: row.subCategory ?? raw.subCategory,
    provider: row.provider ?? raw.provider,
    seriesId: row.seriesId ?? raw.seriesId,
  });
};

const toRawJson = (
  row: StoredVideoRow,
  nextCategory: ReturnType<typeof normalizeVideoCategoryFields>,
) => {
  const raw = parseRawJson(row.rawJson);

  return JSON.stringify({
    ...raw,
    category: nextCategory.category,
    categoryMappingConfidence: nextCategory.categoryMappingConfidence,
    categoryMappingReason: nextCategory.categoryMappingReason,
    rawCategory: nextCategory.rawCategory,
    subCategory: nextCategory.subCategory,
  });
};

export async function reclassifyVideos() {
  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const rows = await prisma.video.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows as StoredVideoRow[]) {
      const video = toVideoItem(row);
      const normalized = normalizeVideoCategoryFields(video);
      const categoryChanged =
        normalized.category !== row.category || normalized.subCategory !== row.subCategory;

      if (categoryChanged) {
        await prisma.video.update({
          data: {
            category: normalized.category,
            rawJson: toRawJson(row, normalized),
            subCategory: normalized.subCategory,
          },
          where: { id: row.id },
        });
        updated += 1;
      }

      scanned += 1;
    }

    cursor = rows.at(-1)?.id;
    console.log(`[reclassify] scanned=${scanned} updated=${updated}`);
  }

  console.log(`[reclassify] done scanned=${scanned} updated=${updated}`);
  return { scanned, updated };
}

reclassifyVideos()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
