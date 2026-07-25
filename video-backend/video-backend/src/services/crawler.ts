import * as cheerio from 'cheerio';
import { classifyVideoCategory, type AppSubCategory } from './categoryClassifier.js';

const BASE_URL = 'https://www.wanmeikk.me';

const getPositiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const UNLIMITED_CRAWL_LIMIT = Number.MAX_SAFE_INTEGER;
const MAX_CATEGORY_PAGES = getPositiveNumber(
  process.env.CRAWL_MAX_CATEGORY_PAGES,
  UNLIMITED_CRAWL_LIMIT,
);
const MAX_DETAIL_SCAN = getPositiveNumber(process.env.CRAWL_MAX_DETAIL_SCAN, UNLIMITED_CRAWL_LIMIT);
const MAX_DETAIL_SCAN_PER_SEED = getPositiveNumber(
  process.env.CRAWL_MAX_DETAIL_SCAN_PER_SEED,
  UNLIMITED_CRAWL_LIMIT,
);
const DETAIL_CONCURRENCY = Math.max(
  1,
  Math.floor(getPositiveNumber(process.env.CRAWL_DETAIL_CONCURRENCY, 1)),
);
const REQUEST_DELAY_MS = getPositiveNumber(process.env.CRAWL_REQUEST_DELAY_MS, 2500);
const REQUEST_JITTER_MS = getPositiveNumber(process.env.CRAWL_REQUEST_JITTER_MS, 1500);
const REQUEST_TIMEOUT_MS = Number(process.env.CRAWL_REQUEST_TIMEOUT_MS ?? 15000);
const BLOCK_BACKOFF_MS = getPositiveNumber(process.env.CRAWL_BLOCK_BACKOFF_MS, 5 * 60 * 1000);
const SEARCH_DETAIL_SCAN = Math.max(
  1,
  Math.floor(getPositiveNumber(process.env.CRAWL_SEARCH_DETAIL_SCAN, 1)),
);
const MAX_EPISODES_PER_VIDEO = Number(
  process.env.CRAWL_MAX_EPISODES_PER_VIDEO ?? Number.MAX_SAFE_INTEGER,
);
const APP_PROVIDER_LABEL = '聚合线路';

type AppCategory = '电影' | '电视剧' | '综艺' | '动漫';

const BALANCED_CATEGORY_WEIGHTS: Record<AppCategory, number> = {
  电视剧: 0.55,
  电影: 0.2,
  综艺: 0.125,
  动漫: 0.125,
};
const BALANCED_CATEGORY_ORDER: AppCategory[] = ['电视剧', '电影', '综艺', '动漫'];

type Seed = {
  slug: string;
  category: AppCategory;
  fallbackSubCategory: AppSubCategory;
  priority: number;
};

export type CrawlDetailEntry = {
  url: string;
  category: AppCategory;
  fallbackSubCategory: AppSubCategory;
  priority: number;
};

export type CrawledEpisode = {
  episode: number;
  episodeLabel: string;
  playPageUrl: string;
  sourceType: 'unsupported';
};

export type CrawledPlayLine = {
  line: number;
  label: string;
  episodes: CrawledEpisode[];
};

export type CrawledVideo = {
  id: string;
  title: string;
  description?: string | undefined;
  cover?: string | undefined;
  thumbnailUrl?: string | undefined;
  source: string;
  sourceType: 'unsupported';
  category: AppCategory;
  subCategory: AppSubCategory;
  categoryMappingConfidence: number;
  categoryMappingReason: string;
  provider: string;
  seriesId: string;
  rawCategory: string;
  tags: string[];
  webViewUrl: string;
  playableInApp: false;
  unsupportedReason: string;
  playLines: CrawledPlayLine[];
};

const seeds: Seed[] = [
  { slug: 'guoju', category: '电视剧', fallbackSubCategory: '国产剧', priority: 1200 },
  { slug: 'hanju', category: '电视剧', fallbackSubCategory: '韩剧', priority: 1000 },
  { slug: 'rihan', category: '电视剧', fallbackSubCategory: '日剧', priority: 930 },
  { slug: 'gangju', category: '电视剧', fallbackSubCategory: '港台剧', priority: 900 },
  { slug: 'meiju', category: '电视剧', fallbackSubCategory: '欧美剧', priority: 880 },
  { slug: 'taiju', category: '电视剧', fallbackSubCategory: '泰剧', priority: 860 },
  { slug: 'tv', category: '电视剧', fallbackSubCategory: '海外剧', priority: 500 },
  { slug: 'dianying', category: '电影', fallbackSubCategory: '剧情片', priority: 400 },
  { slug: 'zongyi', category: '综艺', fallbackSubCategory: '内地综艺', priority: 300 },
  { slug: 'dongman', category: '动漫', fallbackSubCategory: '国漫', priority: 250 },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPoliteDelayMs() {
  return REQUEST_DELAY_MS + Math.floor(Math.random() * REQUEST_JITTER_MS);
}

function isLikelyBlocked(message: string) {
  return /HTTP\s*(403|429|503)|other side closed|fetch failed|ECONNRESET|ETIMEDOUT|aborted/i.test(
    message,
  );
}

function cleanText(value: string | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(url: string) {
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return '';
  }
}

function cleanTitle(value: string) {
  return value
    .replace(/在线观看.*/g, '')
    .replace(/电视剧解析.*/g, '')
    .replace(/电影解析.*/g, '')
    .replace(/剧情介绍.*/g, '')
    .replace(/追剧指南.*/g, '')
    .replace(/｜.*/g, '')
    .replace(/_第\d+页.*/g, '')
    .replace(/-完美看看.*/g, '')
    .replace(/[《》]/g, '')
    .trim();
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function getListUrl(seed: Seed, page: number) {
  if (page <= 1) {
    return `${BASE_URL}/type/${seed.slug}.html`;
  }

  return `${BASE_URL}/type/${seed.slug}-${page}.html`;
}

function getSearchUrl(keyword: string) {
  return `${BASE_URL}/search.html?wd=${encodeURIComponent(keyword)}`;
}

function extractDetailLinks(html: string) {
  const links = new Set<string>();
  const $ = cheerio.load(html);

  $('a[href*="/video/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const url = toAbsoluteUrl(href);
    if (/\/video\/\d+\.html/i.test(url)) {
      links.add(url);
    }
  });

  for (const match of html.matchAll(/["'](\/video\/\d+\.html)["']/gi)) {
    const href = match[1];
    if (!href) continue;

    const url = toAbsoluteUrl(href);
    if (url) {
      links.add(url);
    }
  }

  return [...links];
}

function inferSearchEntryCategory(text: string): {
  category: AppCategory;
  fallbackSubCategory: AppSubCategory;
  priority: number;
} {
  if (/综艺|真人秀|脱口秀|晚会|选秀/.test(text)) {
    return { category: '综艺', fallbackSubCategory: '内地综艺', priority: 700 };
  }

  if (/动漫|动画|番剧|国漫|日漫|美漫/.test(text)) {
    const fallbackSubCategory = /日本|日漫|日语/.test(text)
      ? '日漫'
      : /国产|中国|国漫/.test(text)
        ? '国漫'
        : '海外动漫';

    return { category: '动漫', fallbackSubCategory, priority: 680 };
  }

  if (
    /第\s*\d+\s*集|全\d+集|季|电视剧|连续剧|国产|韩剧|韩国|日本|日剧|欧美|美剧|英剧|泰剧/.test(text)
  ) {
    const fallbackSubCategory = /韩国|韩剧|韩语/.test(text)
      ? '韩剧'
      : /日本|日剧|日语/.test(text)
        ? '日剧'
        : /国产|中国大陆|内地|普通话/.test(text)
          ? '国产剧'
          : /欧美|美国|英国|美剧|英剧|英语/.test(text)
            ? '欧美剧'
            : /泰国|泰剧|泰语/.test(text)
              ? '泰剧'
              : '海外剧';

    return { category: '电视剧', fallbackSubCategory, priority: 760 };
  }

  const fallbackSubCategory = /动作|武侠|犯罪|枪战/.test(text)
    ? '动作片'
    : /喜剧|搞笑/.test(text)
      ? '喜剧片'
      : /爱情|言情/.test(text)
        ? '爱情片'
        : /恐怖|惊悚/.test(text)
          ? '恐怖片'
          : /战争|军事/.test(text)
            ? '战争片'
            : /动画/.test(text)
              ? '动画电影'
              : '剧情片';

  return { category: '电影', fallbackSubCategory, priority: 650 };
}

function extractSearchDetailEntries(html: string, keyword: string) {
  const detailMap = new Map<string, CrawlDetailEntry>();
  const $ = cheerio.load(html);

  $('a[href*="/video/"]').each((_, element) => {
    const href = $(element).attr('href');

    if (!href) {
      return;
    }

    const url = toAbsoluteUrl(href);

    if (!/\/video\/\d+\.html/i.test(url) || detailMap.has(url)) {
      return;
    }

    const summary = cleanText(
      $(element).closest('li, .vodlist_item, .module-card-item, .search-item, .module-item').text(),
    );
    const inferred = inferSearchEntryCategory(`${keyword} ${summary}`);

    detailMap.set(url, {
      url,
      category: inferred.category,
      fallbackSubCategory: inferred.fallbackSubCategory,
      priority: inferred.priority,
    });
  });

  return [...detailMap.values()].slice(0, SEARCH_DETAIL_SCAN);
}

function extractTitle($: cheerio.CheerioAPI) {
  const title =
    cleanText($('meta[property="og:title"]').attr('content')) ||
    cleanText($('h1').first().text()) ||
    cleanText($('title').first().text());

  return cleanTitle(title);
}

function extractDescription($: cheerio.CheerioAPI) {
  const desc =
    cleanText($('meta[name="description"]').attr('content')) ||
    cleanText($('.vod_content').first().text()) ||
    cleanText($('.content').first().text()) ||
    cleanText($('.detail-content').first().text());

  return desc || undefined;
}

function extractCover($: cheerio.CheerioAPI) {
  const raw =
    $('meta[property="og:image"]').attr('content') ||
    $('img[data-original]').first().attr('data-original') ||
    $('img[data-src]').first().attr('data-src') ||
    $('img').first().attr('src');

  if (!raw) return undefined;

  const url = toAbsoluteUrl(raw);
  return url || undefined;
}

function extractKeywords($: cheerio.CheerioAPI) {
  const values = [
    $('meta[name="keywords"]').attr('content'),
    $('meta[property="og:video:area"]').attr('content'),
    $('meta[property="og:video:tag"]').attr('content'),
    $('meta[property="og:video:class"]').attr('content'),
  ];

  return values
    .flatMap((value) => cleanText(value).split(/[,，、\s]+/g))
    .map((value) => value.trim())
    .filter(Boolean);
}

function inferCategory(
  seed: CrawlDetailEntry,
  input: {
    description?: string | undefined;
    keywords: string[];
    title: string;
    url: string;
  },
) {
  return classifyVideoCategory({
    category: seed.category,
    description: input.description,
    fallbackSubCategory: seed.fallbackSubCategory,
    rawCategory: seed.fallbackSubCategory,
    sourceUrl: input.url,
    tags: input.keywords,
    title: input.title,
  });
}

function extractPlayLines($: cheerio.CheerioAPI, html: string) {
  const hrefs = new Set<string>();

  $('a[href*="/play/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      hrefs.add(href);
    }
  });

  for (const match of html.matchAll(/["'](\/play\/\d+-\d+-\d+\.html)["']/gi)) {
    const href = match[1];
    if (href) {
      hrefs.add(href);
    }
  }

  const lineMap = new Map<number, Map<number, CrawledEpisode>>();

  for (const href of hrefs) {
    const absoluteUrl = toAbsoluteUrl(href);
    const match = absoluteUrl.match(/\/play\/(\d+)-(\d+)-(\d+)\.html/i);

    if (!match) continue;

    const line = Number(match[2]);
    const episode = Number(match[3]);

    if (!Number.isFinite(line) || !Number.isFinite(episode)) continue;

    if (!lineMap.has(line)) {
      lineMap.set(line, new Map<number, CrawledEpisode>());
    }

    const episodes = lineMap.get(line);
    if (!episodes || episodes.has(episode)) continue;

    episodes.set(episode, {
      episode,
      episodeLabel: `第${episode}集`,
      playPageUrl: absoluteUrl,
      sourceType: 'unsupported',
    });
  }

  return [...lineMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, episodes]) => ({
      line,
      label: `线路 ${line}`,
      episodes: [...episodes.values()].sort((a, b) => a.episode - b.episode),
    }));
}

function getSourceIdFromDetailUrl(url: string) {
  return url.match(/\/video\/(\d+)\.html/i)?.[1];
}

export function getVideoIdFromDetailUrl(url: string) {
  const sourceId = getSourceIdFromDetailUrl(url);

  return sourceId ? `wanmeikk-${sourceId}` : undefined;
}

async function parseDetail(entry: CrawlDetailEntry): Promise<CrawledVideo | null> {
  try {
    const html = await fetchHtml(entry.url);
    const $ = cheerio.load(html);

    const title = extractTitle($);
    if (!title) {
      return null;
    }

    const description = extractDescription($);
    const cover = extractCover($);
    const keywords = extractKeywords($);
    const mapped = inferCategory(entry, {
      title,
      description,
      keywords,
      url: entry.url,
    });
    const playLines = extractPlayLines($, html);
    const episodeCount = playLines.reduce((sum, line) => sum + line.episodes.length, 0);

    if (episodeCount <= 0) {
      console.log(`[crawler] skip no episodes: ${entry.url}`);
      return null;
    }

    if (episodeCount > MAX_EPISODES_PER_VIDEO) {
      console.log(`[crawler] skip too many episodes ${episodeCount}: ${title}`);
      return null;
    }

    const idMatch = entry.url.match(/\/video\/(\d+)\.html/i);
    const sourceId = idMatch?.[1] ?? Buffer.from(entry.url).toString('base64url');
    const firstEpisode = playLines[0]?.episodes[0];

    const video: CrawledVideo = {
      id: `wanmeikk-${sourceId}`,
      title,
      description,
      cover,
      thumbnailUrl: cover,
      source: firstEpisode?.playPageUrl ?? entry.url,
      sourceType: 'unsupported',
      category: mapped.category,
      subCategory: mapped.subCategory,
      categoryMappingConfidence: mapped.confidence,
      categoryMappingReason: mapped.reason,
      provider: APP_PROVIDER_LABEL,
      seriesId: `wanmeikk-${sourceId}`,
      rawCategory: mapped.subCategory,
      tags: [...new Set([mapped.category, mapped.subCategory, ...keywords])],
      webViewUrl: entry.url,
      playableInApp: false,
      unsupportedReason: '需要通过后端 /api/resolve 懒解析播放地址',
      playLines,
    };

    console.log(
      `[crawler] keep: ${video.title} category=${video.category}/${video.subCategory} episodes=${episodeCount}`,
    );

    return video;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[crawler] detail failed ${entry.url}: ${message}`);

    if (isLikelyBlocked(message)) {
      console.log(`[crawler] backing off for ${BLOCK_BACKOFF_MS}ms after blocked detail request`);
      await sleep(BLOCK_BACKOFF_MS);
    }

    return null;
  }
}

async function collectDetailEntries() {
  const detailMap = new Map<string, CrawlDetailEntry>();

  for (const seed of seeds) {
    let seedDetailCount = 0;
    let emptyPageCount = 0;

    for (let page = 1; page <= MAX_CATEGORY_PAGES; page += 1) {
      const listUrl = getListUrl(seed, page);

      try {
        const html = await fetchHtml(listUrl);
        const links = extractDetailLinks(html);

        let added = 0;
        let upgraded = 0;

        for (const url of links) {
          if (seedDetailCount >= MAX_DETAIL_SCAN_PER_SEED && !detailMap.has(url)) break;

          const nextEntry: CrawlDetailEntry = {
            url,
            category: seed.category,
            fallbackSubCategory: seed.fallbackSubCategory,
            priority: seed.priority,
          };
          const previous = detailMap.get(url);

          if (!previous) {
            detailMap.set(url, nextEntry);
            seedDetailCount += 1;
            added += 1;
          } else if (nextEntry.priority > previous.priority) {
            detailMap.set(url, nextEntry);
            upgraded += 1;
          }
        }

        console.log(
          `[crawler] list ${listUrl} new=${added} upgraded=${upgraded} total=${detailMap.size}`,
        );

        if (added === 0 && upgraded === 0) {
          emptyPageCount += 1;
        } else {
          emptyPageCount = 0;
        }

        if (emptyPageCount >= 3 || seedDetailCount >= MAX_DETAIL_SCAN_PER_SEED) {
          break;
        }

        await sleep(getPoliteDelayMs());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[crawler] list failed ${listUrl}: ${message}`);
        emptyPageCount += 1;

        if (isLikelyBlocked(message)) {
          console.log(`[crawler] backing off for ${BLOCK_BACKOFF_MS}ms after blocked list request`);
          await sleep(BLOCK_BACKOFF_MS);
          break;
        }

        if (emptyPageCount >= 2) {
          break;
        }
      }
    }
  }

  return [...detailMap.values()].sort((a, b) => b.priority - a.priority);
}

function getBalancedCategoryTargets(maxVideos: number) {
  const targets = new Map<AppCategory, number>();
  let assigned = 0;

  for (const category of BALANCED_CATEGORY_ORDER) {
    const target =
      category === BALANCED_CATEGORY_ORDER.at(-1)
        ? Math.max(maxVideos - assigned, 0)
        : Math.max(Math.floor(maxVideos * BALANCED_CATEGORY_WEIGHTS[category]), 1);

    targets.set(category, target);
    assigned += target;
  }

  return targets;
}

function balanceDetailEntries(entries: CrawlDetailEntry[], maxVideos: number) {
  const seenUrls = new Set<string>();
  const selected: CrawlDetailEntry[] = [];
  const groups = new Map<AppCategory, CrawlDetailEntry[]>();
  const targets = getBalancedCategoryTargets(maxVideos);

  for (const entry of entries) {
    const group = groups.get(entry.category) ?? [];
    group.push(entry);
    groups.set(entry.category, group);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => b.priority - a.priority);
  }

  for (const category of BALANCED_CATEGORY_ORDER) {
    const target = targets.get(category) ?? 0;
    const group = groups.get(category) ?? [];

    for (const entry of group) {
      if (
        selected.length >= maxVideos ||
        selected.filter((item) => item.category === category).length >= target
      ) {
        break;
      }

      if (!seenUrls.has(entry.url)) {
        seenUrls.add(entry.url);
        selected.push(entry);
      }
    }
  }

  for (const entry of entries) {
    if (selected.length >= Math.max(maxVideos, MAX_DETAIL_SCAN)) {
      break;
    }

    if (!seenUrls.has(entry.url)) {
      seenUrls.add(entry.url);
      selected.push(entry);
    }
  }

  return selected;
}

export async function crawlVideos(
  maxVideos = getPositiveNumber(process.env.CRAWL_MAX_VIDEOS, UNLIMITED_CRAWL_LIMIT),
  options?: {
    shouldSkipDetail?: (entry: CrawlDetailEntry) => boolean | Promise<boolean>;
  },
) {
  const details = balanceDetailEntries(await collectDetailEntries(), maxVideos);
  const videos: CrawledVideo[] = [];

  console.log(`[crawler] collected detail pages=${details.length}, target videos=${maxVideos}`);

  for (
    let index = 0;
    index < details.length && videos.length < maxVideos;
    index += DETAIL_CONCURRENCY
  ) {
    const batch = details.slice(index, index + DETAIL_CONCURRENCY);
    const activeBatch: CrawlDetailEntry[] = [];

    for (const entry of batch) {
      const shouldSkip = await options?.shouldSkipDetail?.(entry);

      if (shouldSkip) {
        console.log(`[crawler] skip fresh detail: ${entry.url}`);
      } else {
        activeBatch.push(entry);
      }
    }

    const results = await Promise.allSettled(activeBatch.map((entry) => parseDetail(entry)));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        videos.push(result.value);
      }

      if (videos.length >= maxVideos) {
        break;
      }
    }

    console.log(
      `[crawler] scanned=${Math.min(index + batch.length, details.length)} kept=${videos.length}`,
    );
    await sleep(getPoliteDelayMs());
  }

  return videos;
}

export async function crawlSearchVideos(
  keyword: string,
  maxVideos = getPositiveNumber(process.env.CRAWL_SEARCH_MAX_VIDEOS, 6),
  options?: {
    shouldSkipDetail?: (entry: CrawlDetailEntry) => boolean | Promise<boolean>;
  },
) {
  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) {
    return [];
  }

  const html = await fetchHtml(getSearchUrl(normalizedKeyword));
  const details = extractSearchDetailEntries(html, normalizedKeyword);
  const videos: CrawledVideo[] = [];

  console.log(
    `[crawler] search keyword="${normalizedKeyword}" detail pages=${details.length}, target videos=${maxVideos}`,
  );

  for (const entry of details) {
    if (videos.length >= maxVideos) {
      break;
    }

    const shouldSkip = await options?.shouldSkipDetail?.(entry);

    if (shouldSkip) {
      console.log(`[crawler] skip existing search detail: ${entry.url}`);
      continue;
    }

    const video = await parseDetail(entry);

    if (video) {
      videos.push(video);
    }

    await sleep(getPoliteDelayMs());
  }

  return videos;
}
