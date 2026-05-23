import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.wanmeikk.me';

const MAX_CATEGORY_PAGES = Number(process.env.CRAWL_MAX_CATEGORY_PAGES ?? Number.MAX_SAFE_INTEGER);
const MAX_DETAIL_SCAN = Number(process.env.CRAWL_MAX_DETAIL_SCAN ?? Number.MAX_SAFE_INTEGER);
const DETAIL_CONCURRENCY = Number(process.env.CRAWL_DETAIL_CONCURRENCY ?? 4);
const REQUEST_DELAY_MS = Number(process.env.CRAWL_REQUEST_DELAY_MS ?? 120);
const REQUEST_TIMEOUT_MS = Number(process.env.CRAWL_REQUEST_TIMEOUT_MS ?? 15000);
const MAX_EPISODES_PER_VIDEO = Number(
  process.env.CRAWL_MAX_EPISODES_PER_VIDEO ?? Number.MAX_SAFE_INTEGER,
);

type AppCategory = '电影' | '电视剧' | '综艺' | '动漫';

type AppSubCategory =
  | '动作片'
  | '喜剧片'
  | '爱情片'
  | '恐怖片'
  | '剧情片'
  | '战争片'
  | '动画电影'
  | '国产剧'
  | '韩剧'
  | '日剧'
  | '港台剧'
  | '欧美剧'
  | '泰剧'
  | '海外剧'
  | '内地综艺'
  | '港台综艺'
  | '日韩综艺'
  | '欧美综艺'
  | '国漫'
  | '日漫'
  | '港台动漫'
  | '美漫'
  | '海外动漫';

type Seed = {
  slug: string;
  category: AppCategory;
  fallbackSubCategory: AppSubCategory;
  priority: number;
};

type DetailEntry = {
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
  { slug: 'hanju', category: '电视剧', fallbackSubCategory: '韩剧', priority: 1000 },
  { slug: 'guoju', category: '电视剧', fallbackSubCategory: '国产剧', priority: 950 },
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

function cleanText(value: string | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
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

function createClassifyText(input: {
  title: string;
  description?: string | undefined;
  keywords: string[];
  url: string;
}) {
  return normalizeText([input.title, input.description, ...input.keywords, input.url].join(' '));
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function inferMovieSubCategory(text: string, fallback: AppSubCategory): AppSubCategory {
  if (hasAny(text, ['动画电影', '动画片', '动漫电影'])) return '动画电影';
  if (hasAny(text, ['动作', '武侠', '警匪', '犯罪', '枪战'])) return '动作片';
  if (hasAny(text, ['喜剧', '搞笑', '幽默'])) return '喜剧片';
  if (hasAny(text, ['爱情', '言情', '浪漫'])) return '爱情片';
  if (hasAny(text, ['恐怖', '惊悚', '灵异', '鬼片'])) return '恐怖片';
  if (hasAny(text, ['战争', '抗战', '军事'])) return '战争片';

  return fallback === '剧情片' ? '剧情片' : '剧情片';
}

function inferTvSubCategory(text: string, fallback: AppSubCategory): AppSubCategory {
  if (hasAny(text, ['韩国', '韩剧', '韩语'])) return '韩剧';
  if (hasAny(text, ['日本', '日剧', '日语'])) return '日剧';
  if (hasAny(text, ['中国大陆', '大陆', '内地', '国产剧', '普通话'])) return '国产剧';
  if (hasAny(text, ['香港', '台湾', '港台', '港剧', '台剧', '粤语'])) return '港台剧';
  if (hasAny(text, ['美国', '英国', '欧美', '美剧', '英剧', '英语'])) return '欧美剧';
  if (hasAny(text, ['泰国', '泰剧', '泰语'])) return '泰剧';

  if (
    fallback === '国产剧' ||
    fallback === '韩剧' ||
    fallback === '日剧' ||
    fallback === '港台剧' ||
    fallback === '欧美剧' ||
    fallback === '泰剧'
  ) {
    return fallback;
  }

  return '海外剧';
}

function inferVarietySubCategory(text: string, fallback: AppSubCategory): AppSubCategory {
  if (hasAny(text, ['韩国', '日本', '日韩', '韩综', '日综', '韩语', '日语'])) return '日韩综艺';
  if (hasAny(text, ['香港', '台湾', '港台', '粤语'])) return '港台综艺';
  if (hasAny(text, ['美国', '英国', '欧美', '英语'])) return '欧美综艺';

  return fallback === '港台综艺' || fallback === '日韩综艺' || fallback === '欧美综艺'
    ? fallback
    : '内地综艺';
}

function inferAnimeSubCategory(text: string, fallback: AppSubCategory): AppSubCategory {
  if (hasAny(text, ['国产', '中国大陆', '大陆', '国漫', '普通话'])) return '国漫';
  if (hasAny(text, ['日本', '日漫', '番剧', '日语'])) return '日漫';
  if (hasAny(text, ['香港', '台湾', '港台', '粤语'])) return '港台动漫';
  if (hasAny(text, ['美国', '欧美', '美漫', '英语'])) return '美漫';

  return fallback === '日漫' || fallback === '港台动漫' || fallback === '美漫'
    ? fallback
    : '海外动漫';
}

function inferCategory(seed: DetailEntry, text: string) {
  const category = seed.category;

  if (category === '电影') {
    return {
      category,
      subCategory: inferMovieSubCategory(text, seed.fallbackSubCategory),
      confidence: 0.86,
      reason: '后端按电影分类页和标题/地区/关键词映射到前端电影二级分类',
    };
  }

  if (category === '电视剧') {
    return {
      category,
      subCategory: inferTvSubCategory(text, seed.fallbackSubCategory),
      confidence: 0.9,
      reason: '后端按电视剧分类页和标题/地区/关键词映射到前端电视剧二级分类',
    };
  }

  if (category === '综艺') {
    return {
      category,
      subCategory: inferVarietySubCategory(text, seed.fallbackSubCategory),
      confidence: 0.86,
      reason: '后端按综艺分类页和标题/地区/关键词映射到前端综艺二级分类',
    };
  }

  return {
    category,
    subCategory: inferAnimeSubCategory(text, seed.fallbackSubCategory),
    confidence: 0.86,
    reason: '后端按动漫分类页和标题/地区/关键词映射到前端动漫二级分类',
  };
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

async function parseDetail(entry: DetailEntry): Promise<CrawledVideo | null> {
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
    const classifyText = createClassifyText({
      title,
      description,
      keywords,
      url: entry.url,
    });
    const mapped = inferCategory(entry, classifyText);
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
      provider: '完美看看',
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
    return null;
  }
}

async function collectDetailEntries() {
  const detailMap = new Map<string, DetailEntry>();

  for (const seed of seeds) {
    let emptyPageCount = 0;

    for (let page = 1; page <= MAX_CATEGORY_PAGES; page += 1) {
      const listUrl = getListUrl(seed, page);

      try {
        const html = await fetchHtml(listUrl);
        const links = extractDetailLinks(html);

        let added = 0;
        let upgraded = 0;

        for (const url of links) {
          if (detailMap.size >= MAX_DETAIL_SCAN && !detailMap.has(url)) break;

          const nextEntry: DetailEntry = {
            url,
            category: seed.category,
            fallbackSubCategory: seed.fallbackSubCategory,
            priority: seed.priority,
          };
          const previous = detailMap.get(url);

          if (!previous) {
            detailMap.set(url, nextEntry);
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

        if (emptyPageCount >= 3 || detailMap.size >= MAX_DETAIL_SCAN) {
          break;
        }

        await sleep(REQUEST_DELAY_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[crawler] list failed ${listUrl}: ${message}`);
        emptyPageCount += 1;

        if (emptyPageCount >= 2) {
          break;
        }
      }
    }
  }

  return [...detailMap.values()].sort((a, b) => b.priority - a.priority);
}

export async function crawlVideos(
  maxVideos = Number(process.env.CRAWL_MAX_VIDEOS ?? Number.MAX_SAFE_INTEGER),
) {
  const details = await collectDetailEntries();
  const videos: CrawledVideo[] = [];

  console.log(`[crawler] collected detail pages=${details.length}, target videos=${maxVideos}`);

  for (
    let index = 0;
    index < details.length && videos.length < maxVideos;
    index += DETAIL_CONCURRENCY
  ) {
    const batch = details.slice(index, index + DETAIL_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((entry) => parseDetail(entry)));

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
    await sleep(REQUEST_DELAY_MS);
  }

  return videos;
}
