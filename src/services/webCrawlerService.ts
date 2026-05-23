import type {
  RawVideoSource,
  VideoFormat,
  VideoPlayEpisode,
  VideoPlayLine,
  VideoSourceType,
} from '@/types/video';
import { CONTENT_PREFERENCE_POLICY } from '@/domain/ranking/contentPreferencePolicy';
import {
  clearCrawlerDiscoveredPages,
  loadCrawlerDiscoveredPages,
  rememberCrawlerDiscoveredPages,
  selectCrawlerFrontierPages,
  type CrawlerDiscoveredPage,
  type CrawlerDiscoveredPageKind,
  type CrawlerDiscoveredPageStatus,
} from '@/services/crawlerDiscoveryService';

export type WebCrawlerPageConfig = {
  enabled?: boolean;
  maxPages?: number;
  pageParam?: string;
  startPage?: number;
  buildPageUrl?: (baseUrl: string, page: number) => string;
};

export type WebCrawlerOptions = {
  allowedUrls: string[];
  crawlDepth?: number;
  crawlIntervalMs?: number;
  initialUrlPriority?: Map<string, number>;
  maxChildrenPerPage?: number;
  maxConcurrency?: number;
  maxNavigationPageNumber?: number;
  maxNavigationPages?: number;
  maxTotalVideos?: number;
  maxDetailPages?: number;
  maxVideos?: number;
  frontierSeedLimit?: number;
  discoverNavigationAfterEnoughVideos?: boolean;
  sourceUrl?: string;
  onProgress?: (videos: RawVideoSource[]) => void;
  page?: WebCrawlerPageConfig;
  priorityPathPatterns?: AuthorizedWebPageSourceConfig['priorityPathPatterns'];
  provider?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type AuthorizedWebPageSeedPathConfig = {
  path: string;
  priority?: number;
  rawCategory?: string;
};

export type AuthorizedWebPageSourceConfig = {
  crawlDepth?: number;
  crawlIntervalMs?: number;
  enabled?: boolean;
  maxChildrenPerPage?: number;
  maxConcurrency?: number;
  maxDetailPages?: number;
  maxNavigationPageNumber?: number;
  maxNavigationPages?: number;
  maxTotalVideos?: number;
  maxVideos?: number;
  frontierSeedLimit?: number;
  discoverNavigationAfterEnoughVideos?: boolean;
  page?: WebCrawlerPageConfig;
  priorityPathPatterns?: {
    pattern: RegExp;
    score: number;
    rawCategory?: string;
  }[];
  provider?: string;
  seedPathPrefixes?: string[];
  seedPaths?: AuthorizedWebPageSeedPathConfig[];
  timeoutMs?: number;
  url: string;
};

export type WebCrawlerSourceRuntimeOverrides = Partial<
  Pick<
    AuthorizedWebPageSourceConfig,
    | 'crawlDepth'
    | 'crawlIntervalMs'
    | 'maxChildrenPerPage'
    | 'maxConcurrency'
    | 'maxDetailPages'
    | 'maxNavigationPageNumber'
    | 'maxNavigationPages'
    | 'maxVideos'
    | 'frontierSeedLimit'
    | 'discoverNavigationAfterEnoughVideos'
    | 'seedPathPrefixes'
    | 'timeoutMs'
  >
>;

export type CrawlConfiguredAuthorizedWebPagesOptions = Pick<
  WebCrawlerOptions,
  'maxTotalVideos' | 'onProgress' | 'signal'
> & {
  sourceOverrides?: WebCrawlerSourceRuntimeOverrides;
};

type ParentPageMeta = {
  category?: string;
  cover?: string;
  description?: string;
  priorityBoost?: number;
  rawCategory?: string;
  tags?: string[];
  title?: string;
};

type ChildPageLink = {
  meta?: ParentPageMeta;
  priority?: number;
  url: string;
};

type CrawlState = {
  backoffUntilAt: Map<string, number>;
  backoffCounts: Map<string, number>;
  budgetRemaining: number;
  errors: WebCrawlerError[];
  lastProgressAt: number;
  lastProgressRawCount: number;
  lastProgressCardCount: number;
  maxVideos: number;
  discoveredPages: CrawlerDiscoveredPage[];
  videos: RawVideoSource[];
  visited: Set<string>;
};

type CrawlContext = {
  options: WebCrawlerOptions;
  parentMeta?: ParentPageMeta;
  priorityPathPatterns?: NonNullable<AuthorizedWebPageSourceConfig['priorityPathPatterns']>;
  provider?: string;
  sourceUrl?: string;
  state: CrawlState;
};

export const AUTHORIZED_WEB_PAGE_SOURCES: AuthorizedWebPageSourceConfig[] = [
  {
    url: 'https://www.wanmeikk.me/',
    provider: '\u5b8c\u7f8e\u770b\u770b',
    timeoutMs: 20_000,
    crawlIntervalMs: 100,
    crawlDepth: 3,
    maxConcurrency: 2,
    discoverNavigationAfterEnoughVideos: false,
    frontierSeedLimit: 360,
    maxDetailPages: 1_200,
    maxChildrenPerPage: 160,
    maxNavigationPageNumber: 120,
    maxNavigationPages: 420,
    maxVideos: 420,
    seedPaths: [
      {
        path: '/type/hanju.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.koreanDrama,
        rawCategory: '\u97e9\u5267',
      },
      {
        path: '/type/hanju-2.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.koreanDramaPage2,
        rawCategory: '\u97e9\u5267',
      },
      {
        path: '/type/tv.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.tvDrama,
        rawCategory: '\u7535\u89c6\u5267',
      },
      {
        path: '/type/rihan.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.japaneseDrama,
        rawCategory: '\u65e5\u5267',
      },
      {
        path: '/type/meiju.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.westernDrama,
        rawCategory: '\u6b27\u7f8e\u5267',
      },
      {
        path: '/type/gangju.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.gangtaiDrama,
        rawCategory: '\u6e2f\u53f0\u5267',
      },
      {
        path: '/type/guoju.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.chineseDrama,
        rawCategory: '\u56fd\u4ea7\u5267',
      },
      {
        path: '/type/dianying.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.movie,
        rawCategory: '\u7535\u5f71',
      },
      {
        path: '/type/zongyi.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.variety,
        rawCategory: '\u7efc\u827a',
      },
      {
        path: '/type/dongman.html',
        priority: CONTENT_PREFERENCE_POLICY.seedPriority.anime,
        rawCategory: '\u52a8\u6f2b',
      },
      { path: '/', priority: CONTENT_PREFERENCE_POLICY.seedPriority.fallbackHome },
    ],
    priorityPathPatterns: [
      {
        pattern: /\/type\/hanju\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.koreanDrama,
        rawCategory: '\u97e9\u5267',
      },
      {
        pattern: /\/type\/tv\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.tvDrama,
        rawCategory: '\u7535\u89c6\u5267',
      },
      {
        pattern: /\/type\/rihan\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.japaneseDrama,
        rawCategory: '\u65e5\u5267',
      },
      {
        pattern: /\/type\/meiju\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.westernDrama,
        rawCategory: '\u6b27\u7f8e\u5267',
      },
      {
        pattern: /\/type\/gangju\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.gangtaiDrama,
        rawCategory: '\u6e2f\u53f0\u5267',
      },
      {
        pattern: /\/type\/guoju\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.chineseDrama,
        rawCategory: '\u56fd\u4ea7\u5267',
      },
      {
        pattern: /\/type\/dianying\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.movie,
        rawCategory: '\u7535\u5f71',
      },
      {
        pattern: /\/type\/zongyi\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.variety,
        rawCategory: '\u7efc\u827a',
      },
      {
        pattern: /\/type\/dongman\b/i,
        score: CONTENT_PREFERENCE_POLICY.crawlerPathBoosts.anime,
        rawCategory: '\u52a8\u6f2b',
      },
    ],
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video',
    provider: 'MDN Web Docs',
    enabled: false,
    timeoutMs: 15_000,
    crawlIntervalMs: 1_000,
  },
];

export type WebCrawlerResult = {
  discoveredPages: CrawlerDiscoveredPage[];
  errors: WebCrawlerError[];
  videos: RawVideoSource[];
};

export type WebCrawlerError = {
  message: string;
  reason?: 'invalid-url' | 'request-failed' | 'empty-title' | 'empty-media' | 'unsupported-media';
  status?: number;
  url: string;
};

type PlaybackLinkInfo = {
  episode: number;
  episodeLabel?: string;
  line: number;
  lineLabel?: string;
  seriesId: string;
  url: string;
};

type ExtractedPage = {
  author?: string;
  cover?: string;
  danmakuCount?: number;
  description?: string;
  mediaUrls: string[];
  playCount?: number;
  playList?: PlaybackLinkInfo[];
  publishedAt?: string;
  provider?: string;
  rawCategory?: string;
  seriesId?: string;
  tags?: string[];
  title?: string;
  tooManyEpisodes?: boolean;
  unsupportedMediaUrls: string[];
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_CRAWL_DEPTH = 1;
const DEFAULT_MAX_DETAIL_PAGES = 60;
const DEFAULT_MAX_CHILDREN_PER_PAGE = 20;
const DEFAULT_MAX_CONCURRENCY = 6;
const DEFAULT_MAX_NAVIGATION_PAGE_NUMBER = 5;
const DEFAULT_MAX_NAVIGATION_PAGES = 6;
const MAX_EPISODES_PER_VIDEO = 32;
const MAX_HTML_LENGTH = 600_000;
const HTML_STREAM_IDLE_MS = 3_500;
const MIN_LIST_HTML_LENGTH = 160_000;
const MIN_PLAYBACK_HTML_LENGTH = 8_000;
const HTML_PARTIAL_PROBE_INCREMENT = 48_000;
const XHR_PROGRESS_PROBE_INTERVAL = 4;
const CRAWLER_PARSE_YIELD_HTML_LENGTH = 80_000;
const FETCH_RETRY_DELAY_MS = 500;
const HOST_BACKOFF_BASE_MS = 5_000;
const HOST_BACKOFF_MAX_MS = 90_000;
const HOST_BACKOFF_JITTER_RATIO = 0.2;
const HOST_BACKOFF_GROWTH = 1.5;
const CRAWLER_DEBUG_LOGS = false;
const CRAWLER_PROGRESS_MIN_INCREMENT = 8;
const CRAWLER_PROGRESS_RAW_MIN_INCREMENT = 16;
const CRAWLER_PROGRESS_MIN_INTERVAL_MS = 1_500;
const CRAWLER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';
const DIRECT_MEDIA_FORMATS = new Set<VideoFormat>(['mp4', 'm3u8', 'mov', 'm4v', 'mkv', 'webm']);

const KNOWN_MEDIA_FORMATS_BY_EXTENSION: Record<string, VideoFormat> = {
  '3gp': '3gp',
  avi: 'avi',
  flv: 'flv',
  m3u8: 'm3u8',
  m4a: 'm4a',
  m4v: 'm4v',
  mkv: 'mkv',
  mov: 'mov',
  mp3: 'mp3',
  mp4: 'mp4',
  mpd: 'dash',
  mpeg: 'mpeg',
  mpg: 'mpg',
  rmvb: 'rmvb',
  ts: 'ts',
  wav: 'wav',
  webm: 'webm',
};
const UNSUPPORTED_MEDIA_EXTENSIONS = new Set([
  '3gp',
  'aac',
  'avi',
  'flv',
  'm4a',
  'mp3',
  'mpd',
  'mpeg',
  'mpg',
  'ogg',
  'ogv',
  'rmvb',
  'ts',
  'wav',
]);

const MEDIA_EXTENSION_PATTERN = /\.(mp4|m3u8|mov|m4v|mkv|webm)(?:[?#][^\s"'<>]*)?$/i;
const UNSUPPORTED_MEDIA_EXTENSION_PATTERN =
  /\.(3gp|aac|avi|flv|m4a|mp3|mpd|mpeg|mpg|ogg|ogv|rmvb|ts|wav)(?:[?#][^\s"'<>]*)?$/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>\\]+/gi;
const TRAILING_URL_NOISE_PATTERN = /[),.;\]}]+$/;
const SCRIPT_FIELD_URL_PATTERN =
  /["'](?:url|file|source|src|video|videoUrl|playUrl|play_url|m3u8|hls|videoSrc|mediaUrl|media_url|stream)["']\s*:\s*["']([^"']+)["']/gi;
const SCRIPT_LITERAL_URL_PATTERN = /["'`]((?:https?:)?\/\/[^"'`\s<>]+)["'`]/gi;
const PLAYER_CONFIG_PATTERN = /(?:var\s+)?player_[a-z0-9_]*\s*=\s*({[\s\S]*?})\s*(?:;|$)/gi;
const PLAYER_FIELD_PATTERN =
  /["'](?:url|file|source|src|videoUrl|playUrl|play_url|m3u8|hls|videoSrc|mediaUrl|media_url|stream)["']\s*:\s*["']([^"']+)["']/gi;
const PLAYER_ENCRYPT_PATTERN = /["']encrypt["']\s*:\s*["']?(\d+)["']?/i;
const DETAIL_PATH_PATTERN =
  /\/(vod|video|movie|film|play|detail|view|watch|item|drama|anime|tv|show|episode|content|info|topic|voddetail|vodplay|vodtype|playvideo|videoplay|player)\b/i;
const PLAYBACK_PATH_PATTERN = /\/(?:play|player|watch|episode|vodplay|playvideo|videoplay)\b/i;
const VIDEO_DETAIL_PATH_PATTERN =
  /\/(?:video|movie|film|detail|view|item|drama|anime|tv|show|content|info|voddetail)\b/i;
const COLLECTION_PATH_PATTERN =
  /\/(?:rank|ranking|top|list|category|categories|tag|tags|type|label|search|vodshow|vodtype|vod\/show|vod\/type|topic|year|area|actor|director)\b/i;
const NAVIGATION_COLLECTION_PATH_PATTERN =
  /\/(?:list|category|categories|type|label|vodshow|vodtype|vod\/show|vod\/type|topic)\b/i;
const NUMERIC_DETAIL_PATH_PATTERN = /[/-]\d+(?:[-_./]\w*)*\.html?$/i;
const NUMERIC_PLAYBACK_PATH_PATTERN = /[/-]\d+-\d+-\d+\.html?$/i;
const NON_CONTENT_RESOURCE_PATTERN =
  /\.(png|jpg|jpeg|gif|svg|css|js|ico|webp|bmp|tiff|woff2?|ttf|eot|otf|map|json|xml|pdf|zip|rar|7z|tar|gz|exe|apk|dmg|mp3|wav|aac|m4a)(?:\?[^"'\s]*)?$/i;
const NON_CATEGORY_TAG_PATTERN =
  /^(?:4k|8k|1080p|720p|480p|360p|240p|hd|fhd|uhd|h264|h265|hevc|aac|trailer|teaser|preview|sample|demo)$/i;
const CATEGORY_TAG_PATTERN =
  /电影|电视剧|剧集|综艺|动漫|动画|纪录|动作|喜剧|爱情|恐怖|剧情|战争|国产剧|韩剧|日剧|港台剧|欧美剧|泰剧|海外剧|内地综艺|港台综艺|日韩综艺|欧美综艺|国漫|日漫|港台动漫|美漫|海外动漫|animation|anime|movie|film|tv|series|variety|documentary|comedy|drama|action|horror|romance|war|k-drama|j-drama|thai/i;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    const requestIdleCallback = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => unknown;
      }
    ).requestIdleCallback;

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(resolve, { timeout: 64 });
      return;
    }

    setTimeout(resolve, 16);
  });

const yieldAfterLargeHtmlStep = async (html: string) => {
  if (html.length >= CRAWLER_PARSE_YIELD_HTML_LENGTH) {
    await yieldToEventLoop();
  }
};

const getMinUsefulHtmlLength = (pageUrl: string) =>
  canCreateFallbackVideoForPage(pageUrl) ? MIN_PLAYBACK_HTML_LENGTH : MIN_LIST_HTML_LENGTH;

const shouldProbePartialHtml = (htmlLength: number, pageUrl: string, lastProbeLength: number) => {
  if (htmlLength < getMinUsefulHtmlLength(pageUrl)) {
    return false;
  }

  return (
    lastProbeLength === 0 ||
    htmlLength - lastProbeLength >= HTML_PARTIAL_PROBE_INCREMENT ||
    htmlLength >= MAX_HTML_LENGTH
  );
};

const crawlerLog = (...args: unknown[]) => {
  if (CRAWLER_DEBUG_LOGS) {
    console.log(...args);
  }
};

const crawlerWarn = (...args: unknown[]) => {
  if (CRAWLER_DEBUG_LOGS) {
    console.warn(...args);
  }
};

const createTimeoutSignal = (timeoutMs: number): { cleanup: () => void; signal: AbortSignal } => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    cleanup: () => clearTimeout(timeoutId),
    signal: controller.signal,
  };
};

const mergeSignals = (signals: AbortSignal[]) => {
  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }

    signal.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isSameOrigin = (candidateUrl: string, baseUrl: string) => {
  try {
    return new URL(candidateUrl).hostname === new URL(baseUrl).hostname;
  } catch {
    return false;
  }
};

const getUrlPathname = (value: string) => {
  try {
    return new URL(value).pathname;
  } catch {
    return '';
  }
};

const isPlaybackPageUrl = (value: string) => {
  const pathname = getUrlPathname(value);

  return PLAYBACK_PATH_PATTERN.test(pathname) || NUMERIC_PLAYBACK_PATH_PATTERN.test(pathname);
};

const isVideoDetailPageUrl = (value: string) => {
  const pathname = getUrlPathname(value);

  return (
    VIDEO_DETAIL_PATH_PATTERN.test(pathname) ||
    NUMERIC_DETAIL_PATH_PATTERN.test(pathname) ||
    isPlaybackPageUrl(value)
  );
};

const isCollectionPageUrl = (value: string) => COLLECTION_PATH_PATTERN.test(getUrlPathname(value));

const isNavigationCollectionPageUrl = (value: string) => {
  const pathname = getUrlPathname(value);

  return NAVIGATION_COLLECTION_PATH_PATTERN.test(pathname) && !canCreateFallbackVideoForPage(value);
};

const canCreateFallbackVideoForPage = (value: string) =>
  isVideoDetailPageUrl(value) && !isCollectionPageUrl(value);

const canDiscoverNavigationAfterEnoughVideos = (value: string) =>
  !canCreateFallbackVideoForPage(value) || isNavigationCollectionPageUrl(value);

const getCrawlVideoCardCount = (videos: RawVideoSource[]) => {
  const keys = new Set<string>();

  for (const video of videos) {
    const key = (video.seriesId ?? video.source).trim().toLowerCase();

    if (key) {
      keys.add(key);
    }
  }

  return keys.size;
};

const hasEnoughVideos = (state: CrawlState) =>
  getCrawlVideoCardCount(state.videos) >= state.maxVideos;

const normalizeJsonEscapedHtml = (html: string) => html.replace(/\\\//g, '/');

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const decodeBase64Text = (value: string) => {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '');

  if (!normalized) {
    return undefined;
  }

  try {
    const atobLike = (globalThis as { atob?: (input: string) => string }).atob;

    if (typeof atobLike === 'function') {
      return atobLike(normalized);
    }
  } catch {
    // Fall through to the small decoder below.
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let buffer = 0;
  let bits = 0;
  let output = '';

  for (const char of normalized.replace(/=+$/g, '')) {
    const valueIndex = alphabet.indexOf(char);

    if (valueIndex < 0) {
      continue;
    }

    buffer = (buffer << 6) | valueIndex;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output || undefined;
};

const decodePlayerUrl = (rawValue?: string, encrypt?: number) => {
  if (!rawValue) {
    return undefined;
  }

  let value = normalizeJsonEscapedHtml(decodeHtmlEntities(rawValue) ?? rawValue).trim();

  if (!value) {
    return undefined;
  }

  if (encrypt === 2) {
    value = decodeBase64Text(value) ?? value;
  }

  if (encrypt === 1 || encrypt === 2 || /%[0-9a-f]{2}/i.test(value)) {
    value = safeDecodeURIComponent(value);
  }

  return normalizeJsonEscapedHtml(value).trim() || undefined;
};

const withProtocol = (value: string) => (value.startsWith('//') ? `https:${value}` : value);

const normalizeWhitespace = (value?: string) => value?.replace(/\s+/g, ' ').trim();

const firstText = (...values: (string | undefined)[]) =>
  values.map((value) => normalizeWhitespace(decodeHtmlEntities(value))).find(Boolean);

const decodeHtmlEntities = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return normalizeWhitespace(
    value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
      const normalizedToken = token.toLowerCase();

      if (normalizedToken.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(normalizedToken.slice(2), 16));
      }

      if (normalizedToken.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(normalizedToken.slice(1), 10));
      }

      return namedEntities[normalizedToken] ?? entity;
    }),
  );
};

const getAttribute = (tag: string, attribute: string) => {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return decodeHtmlEntities(match?.[2]);
};

const stripHtmlTags = (value?: string) =>
  decodeHtmlEntities(value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

const getMetaContent = (html: string, names: string[]) => {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const normalizedNames = names.map((name) => name.toLowerCase());

  for (const tag of metaTags) {
    const key =
      getAttribute(tag, 'property') ?? getAttribute(tag, 'name') ?? getAttribute(tag, 'itemprop');

    if (key && normalizedNames.includes(key.toLowerCase())) {
      return getAttribute(tag, 'content');
    }
  }

  return undefined;
};

const resolveUrl = (value: string, baseUrl: string) => {
  try {
    const url = new URL(value.trim().replace(TRAILING_URL_NOISE_PATTERN, ''), baseUrl);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    url.hash = '';

    return url.toString();
  } catch {
    return undefined;
  }
};

const isDirectMediaUrl = (value: string) => {
  const cleanValue = value.trim().replace(TRAILING_URL_NOISE_PATTERN, '').split(/[?#]/)[0] ?? '';
  const extension = cleanValue.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() as
    | VideoFormat
    | undefined;

  return Boolean(extension && DIRECT_MEDIA_FORMATS.has(extension));
};

const getMediaExtension = (value: string) =>
  value
    .trim()
    .replace(TRAILING_URL_NOISE_PATTERN, '')
    .split(/[?#]/)[0]
    ?.match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();

const isUnsupportedMediaUrl = (value: string) => {
  const extension = getMediaExtension(value);

  return Boolean(extension && UNSUPPORTED_MEDIA_EXTENSIONS.has(extension));
};

const getFormatFromUrl = (source: string): VideoFormat | undefined => {
  const extension = getMediaExtension(source);

  return extension ? KNOWN_MEDIA_FORMATS_BY_EXTENSION[extension] : undefined;
};

const getSourceType = (format?: VideoFormat): VideoSourceType | undefined => {
  if (!format) {
    return undefined;
  }

  return format === 'm3u8' ? 'hls' : format;
};

const normalizeMediaUrl = (value: string, baseUrl: string) => {
  const normalizedValue = normalizeWhitespace(value);

  if (!normalizedValue || /^(blob|data|file|javascript):/i.test(normalizedValue)) {
    return undefined;
  }

  const resolvedUrl = resolveUrl(value, baseUrl);

  if (!resolvedUrl || !isDirectMediaUrl(resolvedUrl)) {
    return undefined;
  }

  return resolvedUrl;
};

const normalizeUnsupportedMediaUrl = (value: string, baseUrl: string) => {
  const normalizedValue = normalizeWhitespace(value);

  if (!normalizedValue || /^(blob|data|file|javascript):/i.test(normalizedValue)) {
    return undefined;
  }

  const resolvedUrl = resolveUrl(value, baseUrl);

  if (!resolvedUrl || !isUnsupportedMediaUrl(resolvedUrl)) {
    return undefined;
  }

  return resolvedUrl;
};

const dedupeValues = <T>(values: T[], getKey: (value: T) => string | undefined) => {
  const seen = new Set<string>();
  const uniqueValues: T[] = [];

  for (const value of values) {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(value);
  }

  return uniqueValues;
};

type ScriptBlock = {
  body: string;
  isLdJson: boolean;
};

type PageTokens = {
  anchorTags: string[];
  attributeTags: string[];
  iframeTags: string[];
  jsonLdPayloads: object[];
  mediaAnchorUrls: string[];
  mediaAttributeUrls: string[];
  mediaPlainTextUrls: string[];
  mediaStructuredUrls: string[];
  metaTags: string[];
  scripts: ScriptBlock[];
  title?: string;
  unsupportedAttributeUrls: string[];
  unsupportedPlainTextUrls: string[];
  unsupportedStructuredUrls: string[];
};

const TOKENIZE_ANCHOR_PATTERN = /<a\b[^>]*href\s*=\s*(['"])[^'"]+\1[^>]*(?:>[\s\S]*?<\/a>|\/?>)/gi;
const TOKENIZE_ATTRIBUTE_PATTERN = /<(?:video|source|a)\b[^>]*>/gi;
const TOKENIZE_IFRAME_PATTERN = /<iframe\b[^>]*>/gi;
const TOKENIZE_META_PATTERN = /<meta\b[^>]*>/gi;
const TOKENIZE_SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const TOKENIZE_TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const TOKENIZE_LDJSON_TYPE_PATTERN = /type\s*=\s*(['"])application\/ld\+json\1/i;

const runAllMatches = (html: string, pattern: RegExp): string[] => {
  const matcher = new RegExp(pattern.source, pattern.flags);
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(html)) !== null) {
    results.push(match[0]);
  }

  return results;
};

const tokenizeScripts = (html: string): ScriptBlock[] => {
  const matcher = new RegExp(TOKENIZE_SCRIPT_PATTERN.source, TOKENIZE_SCRIPT_PATTERN.flags);
  const blocks: ScriptBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(html)) !== null) {
    const [, attrs, body] = match;
    blocks.push({
      body,
      isLdJson: TOKENIZE_LDJSON_TYPE_PATTERN.test(attrs ?? ''),
    });
  }

  return blocks;
};

const tokenizePlainTextUrls = (html: string) => {
  const matcher = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
  const mediaUrls: string[] = [];
  const unsupportedUrls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(html)) !== null) {
    const cleanValue = match[0].replace(TRAILING_URL_NOISE_PATTERN, '');

    if (MEDIA_EXTENSION_PATTERN.test(cleanValue)) {
      mediaUrls.push(cleanValue);
    } else if (UNSUPPORTED_MEDIA_EXTENSION_PATTERN.test(cleanValue)) {
      unsupportedUrls.push(cleanValue);
    }
  }

  return { mediaUrls, unsupportedUrls };
};

const collectAttributeUrlsFromTags = (
  tags: string[],
  baseUrl: string,
  filter: (resolvedUrl: string) => boolean,
  normalize: (value: string, baseUrl: string) => string | undefined,
): string[] => {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const tag of tags) {
    const value = getAttribute(tag, 'src') ?? getAttribute(tag, 'href');

    if (!value) {
      continue;
    }

    const resolvedUrl = normalize(value, baseUrl);

    if (!resolvedUrl || !filter(resolvedUrl)) {
      continue;
    }

    const key = resolvedUrl.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(resolvedUrl);
  }

  return results;
};

const collectStructuredUrlsFromPayloads = (
  payloads: object[],
  baseUrl: string,
  normalize: (value: string, baseUrl: string) => string | undefined,
) => {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const payload of payloads) {
    const values: string[] = [];
    collectJsonValues(payload, values);

    for (const value of values) {
      const resolvedUrl = normalize(value, baseUrl);

      if (!resolvedUrl) {
        continue;
      }

      const key = resolvedUrl.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(resolvedUrl);
    }
  }

  return results;
};

const tokenizeHtmlPage = (html: string, baseUrl: string): PageTokens => {
  const anchorTags = runAllMatches(html, TOKENIZE_ANCHOR_PATTERN);
  const attributeTags = runAllMatches(html, TOKENIZE_ATTRIBUTE_PATTERN);
  const iframeTags = runAllMatches(html, TOKENIZE_IFRAME_PATTERN);
  const metaTags = runAllMatches(html, TOKENIZE_META_PATTERN);
  const scripts = tokenizeScripts(html);
  const titleMatch = html.match(TOKENIZE_TITLE_PATTERN);
  const title = decodeHtmlEntities(titleMatch?.[1]);

  const jsonLdPayloads: object[] = scripts
    .filter((script) => script.isLdJson)
    .map((script) => safeParseJson(decodeHtmlEntities(script.body) ?? script.body))
    .filter((payload): payload is object => Boolean(payload && typeof payload === 'object'));

  const mediaAttributeUrls = collectAttributeUrlsFromTags(
    attributeTags,
    baseUrl,
    isDirectMediaUrl,
    normalizeMediaUrl,
  );
  const unsupportedAttributeUrls = collectAttributeUrlsFromTags(
    attributeTags,
    baseUrl,
    isUnsupportedMediaUrl,
    normalizeUnsupportedMediaUrl,
  );
  const mediaAnchorUrls = collectAttributeUrlsFromTags(
    anchorTags,
    baseUrl,
    isDirectMediaUrl,
    normalizeMediaUrl,
  );
  const mediaStructuredUrls = collectStructuredUrlsFromPayloads(
    jsonLdPayloads,
    baseUrl,
    normalizeMediaUrl,
  );
  const unsupportedStructuredUrls = collectStructuredUrlsFromPayloads(
    jsonLdPayloads,
    baseUrl,
    normalizeUnsupportedMediaUrl,
  );
  const { mediaUrls: mediaPlainTextUrls, unsupportedUrls: unsupportedPlainTextUrls } =
    tokenizePlainTextUrls(html);

  return {
    anchorTags,
    attributeTags,
    iframeTags,
    jsonLdPayloads,
    mediaAnchorUrls,
    mediaAttributeUrls,
    mediaPlainTextUrls,
    mediaStructuredUrls,
    metaTags,
    scripts,
    title,
    unsupportedAttributeUrls,
    unsupportedPlainTextUrls,
    unsupportedStructuredUrls,
  };
};

const tokenizeHtmlPageInBatches = async (html: string, baseUrl: string): Promise<PageTokens> => {
  const anchorTags = runAllMatches(html, TOKENIZE_ANCHOR_PATTERN);
  await yieldAfterLargeHtmlStep(html);

  const attributeTags = runAllMatches(html, TOKENIZE_ATTRIBUTE_PATTERN);
  await yieldAfterLargeHtmlStep(html);

  const iframeTags = runAllMatches(html, TOKENIZE_IFRAME_PATTERN);
  await yieldAfterLargeHtmlStep(html);

  const metaTags = runAllMatches(html, TOKENIZE_META_PATTERN);
  await yieldAfterLargeHtmlStep(html);

  const scripts = tokenizeScripts(html);
  await yieldAfterLargeHtmlStep(html);

  const titleMatch = html.match(TOKENIZE_TITLE_PATTERN);
  const title = decodeHtmlEntities(titleMatch?.[1]);

  const jsonLdPayloads: object[] = scripts
    .filter((script) => script.isLdJson)
    .map((script) => safeParseJson(decodeHtmlEntities(script.body) ?? script.body))
    .filter((payload): payload is object => Boolean(payload && typeof payload === 'object'));
  await yieldAfterLargeHtmlStep(html);

  const mediaAttributeUrls = collectAttributeUrlsFromTags(
    attributeTags,
    baseUrl,
    isDirectMediaUrl,
    normalizeMediaUrl,
  );
  await yieldAfterLargeHtmlStep(html);

  const unsupportedAttributeUrls = collectAttributeUrlsFromTags(
    attributeTags,
    baseUrl,
    isUnsupportedMediaUrl,
    normalizeUnsupportedMediaUrl,
  );
  const mediaAnchorUrls = collectAttributeUrlsFromTags(
    anchorTags,
    baseUrl,
    isDirectMediaUrl,
    normalizeMediaUrl,
  );
  await yieldAfterLargeHtmlStep(html);

  const mediaStructuredUrls = collectStructuredUrlsFromPayloads(
    jsonLdPayloads,
    baseUrl,
    normalizeMediaUrl,
  );
  const unsupportedStructuredUrls = collectStructuredUrlsFromPayloads(
    jsonLdPayloads,
    baseUrl,
    normalizeUnsupportedMediaUrl,
  );
  await yieldAfterLargeHtmlStep(html);

  const { mediaUrls: mediaPlainTextUrls, unsupportedUrls: unsupportedPlainTextUrls } =
    tokenizePlainTextUrls(html);

  return {
    anchorTags,
    attributeTags,
    iframeTags,
    jsonLdPayloads,
    mediaAnchorUrls,
    mediaAttributeUrls,
    mediaPlainTextUrls,
    mediaStructuredUrls,
    metaTags,
    scripts,
    title,
    unsupportedAttributeUrls,
    unsupportedPlainTextUrls,
    unsupportedStructuredUrls,
  };
};

const getMetaContentFromTokens = (tokens: PageTokens, names: string[]) => {
  const normalizedNames = names.map((name) => name.toLowerCase());

  for (const tag of tokens.metaTags) {
    const key =
      getAttribute(tag, 'property') ?? getAttribute(tag, 'name') ?? getAttribute(tag, 'itemprop');

    if (key && normalizedNames.includes(key.toLowerCase())) {
      return getAttribute(tag, 'content');
    }
  }

  return undefined;
};

const getStructuredDataTextContentFromTokens = (tokens: PageTokens, keys: string[]) => {
  const values: string[] = [];
  const normalizedKeys = keys.map((key) => key.toLowerCase());

  tokens.jsonLdPayloads.forEach((payload) =>
    collectStructuredDataTextByKeys(payload, normalizedKeys, values),
  );

  return firstText(...values);
};

const getStructuredDataListContentFromTokens = (tokens: PageTokens, keys: string[]) => {
  const values: string[] = [];
  const normalizedKeys = keys.map((key) => key.toLowerCase());

  tokens.jsonLdPayloads.forEach((payload) =>
    collectStructuredDataTextByKeys(payload, normalizedKeys, values),
  );

  return [...new Set(values.flatMap(splitListText))];
};

const getMetaListContentFromTokens = (tokens: PageTokens, names: string[]) => {
  const metaValues = names.flatMap((name) => {
    const content = getMetaContentFromTokens(tokens, [name]);
    return splitListText(content);
  });

  return [...new Set(metaValues)];
};

const getMetaOrStructuredTextFromTokens = (
  tokens: PageTokens,
  metaNames: string[],
  structuredKeys: string[],
) =>
  firstText(
    getMetaContentFromTokens(tokens, metaNames),
    getStructuredDataTextContentFromTokens(tokens, structuredKeys),
  );

const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const collectJsonValues = (value: unknown, values: string[]) => {
  if (typeof value === 'string') {
    values.push(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonValues(item, values));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectJsonValues(item, values));
  }
};

const collectStructuredDataTextByKeys = (value: unknown, keys: string[], output: string[]) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectStructuredDataTextByKeys(item, keys, output));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (keys.includes(key.toLowerCase())) {
      if (typeof item === 'string') {
        output.push(item);
      } else if (Array.isArray(item)) {
        item.forEach((entry) => {
          if (typeof entry === 'string') {
            output.push(entry);
          }
        });
      }
    }

    collectStructuredDataTextByKeys(item, keys, output);
  }
};

const PLAYBACK_URL_PATTERN =
  /\/(?:play|player|watch|episode|vodplay|playvideo|videoplay)\/([a-z0-9_-]+)-(\d+)-(\d+)\.html?/i;
const VIDEO_DETAIL_URL_PATTERN =
  /\/(?:video|movie|film|detail|view|item|drama|anime|tv|show|content|info|voddetail)\/(\d+)(?:[-_]\d+)?\.html?/i;

const parsePlaybackUrl = (
  url: string,
): { episode: number; line: number; seriesId: string } | undefined => {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(PLAYBACK_URL_PATTERN);

    if (!match) {
      return undefined;
    }

    const seriesId = match[1];
    const line = Number.parseInt(match[2], 10);
    const episode = Number.parseInt(match[3], 10);

    if (!seriesId || !Number.isFinite(line) || !Number.isFinite(episode)) {
      return undefined;
    }

    return { episode, line, seriesId };
  } catch {
    return undefined;
  }
};

const parseDetailUrl = (url: string): { seriesId: string } | undefined => {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(VIDEO_DETAIL_URL_PATTERN);

    if (!match || !match[1]) {
      return undefined;
    }

    return { seriesId: match[1] };
  } catch {
    return undefined;
  }
};

const collectAllPlaybackLinks = (
  html: string,
  baseUrl: string,
  anchorTags = collectAnchorTags(html),
): PlaybackLinkInfo[] => {
  const seen = new Set<string>();
  const items: PlaybackLinkInfo[] = [];
  const anchors = anchorTags;

  for (const tag of anchors) {
    const href = getAttribute(tag, 'href');

    if (!href) {
      continue;
    }

    const resolved = resolveUrl(href, baseUrl);

    if (!resolved || !isHttpUrl(resolved) || !isSameOrigin(resolved, baseUrl)) {
      continue;
    }

    const info = parsePlaybackUrl(resolved);

    if (!info) {
      continue;
    }

    const key = resolved.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push({
      episode: info.episode,
      episodeLabel: firstText(
        getAttribute(tag, 'title'),
        getAttribute(tag, 'aria-label'),
        stripHtmlTags(tag),
      ),
      line: info.line,
      seriesId: info.seriesId,
      url: resolved,
    });
  }

  return items;
};

const inferDetailSeriesId = (infos: PlaybackLinkInfo[]): string | undefined => {
  if (infos.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();

  for (const info of infos) {
    counts.set(info.seriesId, (counts.get(info.seriesId) ?? 0) + 1);
  }

  let best: { seriesId: string; count: number } | undefined;

  for (const [seriesId, count] of counts) {
    if (!best || count > best.count) {
      best = { seriesId, count };
    }
  }

  return best?.seriesId;
};

const collectPlaybackLinksForSeries = (
  links: PlaybackLinkInfo[],
  targetSeriesId?: string,
): PlaybackLinkInfo[] => {
  if (links.length === 0) {
    return links;
  }

  const seriesIdSet = new Set(links.map((info) => info.seriesId));

  if (seriesIdSet.size <= 1) {
    return links;
  }

  if (targetSeriesId && seriesIdSet.has(targetSeriesId)) {
    return links.filter((info) => info.seriesId === targetSeriesId);
  }

  const dominant = inferDetailSeriesId(links);

  return dominant ? links.filter((info) => info.seriesId === dominant) : links;
};

const MACCMS_LINE_SEPARATOR = /\$\$\$/;
const MACCMS_EPISODE_SEPARATOR = /#/;
const MACCMS_LABEL_SEPARATOR = /\$/;
const MACCMS_PLAYLIST_FIELD_PATTERN =
  /["'](?:vod_play_url|playUrl|playurl|play_data|playList|playlist|players)["']\s*:\s*["']([^"']+)["']/gi;
const MACCMS_PLAYLIST_BLOCK_PATTERN =
  /(?:vod_play_url|play_data|playList|playlist)\s*[:=]\s*["']([^"']+)["']/gi;

const normalizeMacCmsToken = (value: string) =>
  normalizeJsonEscapedHtml(decodeHtmlEntities(value) ?? value).trim();

const parseMacCmsPlaylistField = (value: string, baseUrl: string): PlaybackLinkInfo[][] => {
  const normalized = normalizeMacCmsToken(value);

  if (!normalized) {
    return [];
  }

  const lineGroups: PlaybackLinkInfo[][] = [];

  for (const [lineIndex, lineSegment] of normalized
    .split(MACCMS_LINE_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .entries()) {
    const episodes = lineSegment
      .split(MACCMS_EPISODE_SEPARATOR)
      .map((segment) => segment.trim())
      .filter(Boolean);
    const groupItems: PlaybackLinkInfo[] = [];

    for (const [episodeIndex, episodeSegment] of episodes.entries()) {
      const [rawLabel, rawHref] = episodeSegment.split(MACCMS_LABEL_SEPARATOR);
      const href = (rawHref ?? rawLabel ?? '').trim();

      if (!href) {
        continue;
      }

      const resolved = resolveUrl(withProtocol(href), baseUrl);

      if (!resolved || !isHttpUrl(resolved)) {
        continue;
      }

      const parsed = parsePlaybackUrl(resolved);
      const line = parsed?.line ?? lineIndex + 1;
      const episode = parsed?.episode ?? episodeIndex + 1;
      const seriesId = parsed?.seriesId ?? '';
      const info: PlaybackLinkInfo = {
        episode,
        episodeLabel:
          rawHref && rawLabel ? normalizeWhitespace(decodeHtmlEntities(rawLabel)) : undefined,
        line,
        seriesId,
        url: resolved,
      };

      groupItems.push(info);
    }

    if (groupItems.length > 0) {
      lineGroups.push(groupItems);
    }
  }

  return lineGroups;
};

const collectMacCmsPlaylistFromTokens = (
  tokens: PageTokens,
  baseUrl: string,
): PlaybackLinkInfo[] => {
  const matchers = [
    new RegExp(MACCMS_PLAYLIST_FIELD_PATTERN.source, MACCMS_PLAYLIST_FIELD_PATTERN.flags),
    new RegExp(MACCMS_PLAYLIST_BLOCK_PATTERN.source, MACCMS_PLAYLIST_BLOCK_PATTERN.flags),
  ];
  const seen = new Set<string>();
  const collected: PlaybackLinkInfo[] = [];

  for (const script of tokens.scripts) {
    for (const matcher of matchers) {
      matcher.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = matcher.exec(script.body)) !== null) {
        const lineGroups = parseMacCmsPlaylistField(match[1], baseUrl);

        lineGroups.forEach((group, lineIndex) => {
          const normalizedLineNumber = group[0]?.line ?? lineIndex + 1;

          group.forEach((info, episodeIndex) => {
            const effectiveLine = info.line ?? normalizedLineNumber;
            const effectiveEpisode = info.episode ?? episodeIndex + 1;
            const key = `${effectiveLine}:${effectiveEpisode}:${info.url.toLowerCase()}`;

            if (seen.has(key)) {
              return;
            }

            seen.add(key);
            collected.push({
              ...info,
              line: effectiveLine,
              episode: effectiveEpisode,
            });
          });
        });
      }
    }
  }

  return collected;
};

const buildPlayLinesFromInfos = (
  infos: PlaybackLinkInfo[],
  resolveEpisodeMedia?: (info: PlaybackLinkInfo) => {
    mediaUrl?: string;
    format?: VideoFormat;
  },
): VideoPlayLine[] => {
  if (infos.length === 0) {
    return [];
  }

  const byLine = new Map<number, { episodes: VideoPlayEpisode[]; label?: string }>();

  for (const info of infos) {
    const resolved = resolveEpisodeMedia?.(info) ?? {};
    const lineGroup = byLine.get(info.line) ?? {
      episodes: [],
      label: info.lineLabel,
    };

    lineGroup.episodes.push({
      episode: info.episode,
      episodeLabel: info.episodeLabel ?? `\u7b2c${info.episode}\u96c6`,
      format: resolved.format,
      mediaUrl: resolved.mediaUrl,
      playPageUrl: info.url,
      sourceType: resolved.mediaUrl ? getSourceType(resolved.format ?? 'unknown') : undefined,
    });
    byLine.set(info.line, lineGroup);
  }

  return Array.from(byLine.entries())
    .sort(([leftLine], [rightLine]) => leftLine - rightLine)
    .map(([line, group]) => ({
      episodes: [...group.episodes].sort((left, right) => left.episode - right.episode),
      label: group.label ?? `\u7ebf\u8def${line}`,
      line,
    }));
};

const parseNavigationPaginationUrl = (navigationUrl: string) => {
  try {
    const url = new URL(navigationUrl);
    const path = url.pathname;
    const match = path.match(/^(.*?)(?:-\d+)?\.html?$/i);

    if (!match?.[1]) {
      return undefined;
    }

    const pageMatch = path.match(/-(\d+)\.html?$/i);

    return {
      basePath: `${match[1]}.html`,
      page: pageMatch ? Number.parseInt(pageMatch[1], 10) : 1,
      url,
    };
  } catch {
    return undefined;
  }
};

const buildNavigationPaginationUrls = (navigationUrl: string, maxPageNumber: number): string[] => {
  if (maxPageNumber <= 1) {
    return [];
  }

  const parsed = parseNavigationPaginationUrl(navigationUrl);

  if (!parsed) {
    return [];
  }

  try {
    return Array.from({ length: maxPageNumber - 1 }, (_, index) => {
      const page = index + 2;
      const nextUrl = new URL(parsed.url.toString());
      nextUrl.pathname = parsed.basePath.replace(/\.html?$/i, `-${page}.html`);
      nextUrl.search = '';
      nextUrl.hash = '';

      return nextUrl.toString();
    });
  } catch {
    return [];
  }
};

const getDynamicNavigationPageNumber = (
  anchorTags: string[],
  navigationUrl: string,
  maxPageNumber: number,
) => {
  const configuredMax = Math.max(1, maxPageNumber);
  const target = parseNavigationPaginationUrl(navigationUrl);

  if (!target) {
    return configuredMax;
  }

  let discoveredMax = target.page;

  for (const tag of anchorTags) {
    const href = getAttribute(tag, 'href');

    if (!href || /^(javascript|mailto|tel|data|blob|file):/i.test(href.trim())) {
      continue;
    }

    const resolved = resolveUrl(href, navigationUrl);

    if (
      !resolved ||
      !isHttpUrl(resolved) ||
      !isSameOrigin(resolved, navigationUrl) ||
      !isNavigationCollectionPageUrl(resolved)
    ) {
      continue;
    }

    const parsed = parseNavigationPaginationUrl(resolved);

    if (!parsed || parsed.basePath !== target.basePath) {
      continue;
    }

    discoveredMax = Math.max(discoveredMax, parsed.page);
  }

  if (discoveredMax > 1) {
    return Math.min(discoveredMax, configuredMax);
  }

  return configuredMax;
};

const collectIframeSrcs = (html: string, baseUrl: string) => {
  const candidates = new Set<string>();
  const tags = html.match(/<iframe\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const src = getAttribute(tag, 'src') ?? getAttribute(tag, 'data-src');

    if (!src) {
      continue;
    }

    const resolved = resolveUrl(withProtocol(src), baseUrl);

    if (resolved && isHttpUrl(resolved)) {
      candidates.add(resolved);
    }
  }

  return [...candidates];
};

const collectMetaLinkedUrls = (html: string, baseUrl: string) => {
  const candidates = new Set<string>();

  for (const name of ['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player']) {
    const value = getMetaContent(html, [name]);
    const resolved = value ? resolveUrl(withProtocol(value), baseUrl) : undefined;

    if (resolved && isHttpUrl(resolved)) {
      candidates.add(resolved);
    }
  }

  return [...candidates];
};

const collectPlayerConfigUrls = (block: string): string[] => {
  const urls: string[] = [];
  const matcher = new RegExp(PLAYER_CONFIG_PATTERN.source, PLAYER_CONFIG_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(block)) !== null) {
    const objectLiteral = match[1];
    const parsed = safeParseJson(objectLiteral);
    const encrypt =
      typeof parsed === 'object' && parsed && 'encrypt' in parsed
        ? Number((parsed as { encrypt?: unknown }).encrypt)
        : Number.parseInt(objectLiteral.match(PLAYER_ENCRYPT_PATTERN)?.[1] ?? '', 10);

    if (parsed && typeof parsed === 'object') {
      for (const key of [
        'url',
        'file',
        'source',
        'src',
        'videoUrl',
        'playUrl',
        'play_url',
        'm3u8',
        'hls',
        'videoSrc',
        'mediaUrl',
        'media_url',
        'stream',
      ]) {
        const value = (parsed as Record<string, unknown>)[key];
        const decoded = typeof value === 'string' ? decodePlayerUrl(value, encrypt) : undefined;

        if (decoded) {
          urls.push(decoded);
        }
      }

      continue;
    }

    const fieldMatcher = new RegExp(PLAYER_FIELD_PATTERN.source, PLAYER_FIELD_PATTERN.flags);
    let fieldMatch: RegExpExecArray | null;

    while ((fieldMatch = fieldMatcher.exec(objectLiteral)) !== null) {
      const decoded = decodePlayerUrl(fieldMatch[1], encrypt);

      if (decoded) {
        urls.push(decoded);
      }
    }
  }

  return urls;
};

const collectScriptLiteralMediaUrlsFromScripts = (
  scripts: ScriptBlock[],
  baseUrl: string,
): { directCandidates: string[]; unsupportedCandidates: string[] } => {
  const direct = new Set<string>();
  const unsupported = new Set<string>();
  const nonJsonScripts = scripts.filter((script) => !script.isLdJson);

  if (nonJsonScripts.length === 0) {
    return { directCandidates: [], unsupportedCandidates: [] };
  }

  const consume = (raw: string) => {
    if (!raw) {
      return;
    }

    const candidate = withProtocol(raw.trim());
    const resolved = resolveUrl(candidate, baseUrl);

    if (!resolved) {
      return;
    }

    if (isDirectMediaUrl(resolved)) {
      direct.add(resolved);
      return;
    }

    if (isUnsupportedMediaUrl(resolved)) {
      unsupported.add(resolved);
    }
  };

  for (const script of nonJsonScripts) {
    const block = normalizeJsonEscapedHtml(script.body);
    const literalMatcher = new RegExp(
      SCRIPT_LITERAL_URL_PATTERN.source,
      SCRIPT_LITERAL_URL_PATTERN.flags,
    );
    const fieldMatcher = new RegExp(
      SCRIPT_FIELD_URL_PATTERN.source,
      SCRIPT_FIELD_URL_PATTERN.flags,
    );
    let literalMatch: RegExpExecArray | null;
    let fieldMatch: RegExpExecArray | null;

    while ((literalMatch = literalMatcher.exec(block)) !== null) {
      consume(literalMatch[1]);
    }

    while ((fieldMatch = fieldMatcher.exec(block)) !== null) {
      consume(fieldMatch[1]);
    }

    for (const decodedPlayerUrl of collectPlayerConfigUrls(block)) {
      consume(decodedPlayerUrl);
    }
  }

  return {
    directCandidates: [...direct],
    unsupportedCandidates: [...unsupported],
  };
};

const collectScriptLiteralMediaUrlsFromTokens = (tokens: PageTokens, baseUrl: string) =>
  collectScriptLiteralMediaUrlsFromScripts(tokens.scripts, baseUrl);

const extractDetailLinks = (
  html: string,
  baseUrl: string,
  anchorTags = collectAnchorTags(html),
) => {
  const candidates: ChildPageLink[] = [];
  const anchors = anchorTags;
  const seen = new Set<string>();

  for (const tag of anchors) {
    const href = getAttribute(tag, 'href');

    if (!href) {
      continue;
    }

    if (/^(javascript|mailto|tel|data|blob|file):/i.test(href.trim())) {
      continue;
    }

    const resolved = resolveUrl(href, baseUrl);

    if (!resolved || !isHttpUrl(resolved) || !isSameOrigin(resolved, baseUrl)) {
      continue;
    }

    if (NON_CONTENT_RESOURCE_PATTERN.test(resolved)) {
      continue;
    }

    if (matchesExcludedUrl(resolved)) {
      // Skip excluded categories (e.g. /type/jilu) without spending budget.
      continue;
    }

    const path = getUrlPathname(resolved);

    if (!path || path === '/') {
      continue;
    }

    if (isCollectionPageUrl(resolved)) {
      continue;
    }

    if (DETAIL_PATH_PATTERN.test(path) || NUMERIC_DETAIL_PATH_PATTERN.test(path)) {
      const key = resolved.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      const playbackSeriesMatch = path.match(
        /^\/(?:play|player|watch|episode|vodplay|playvideo|videoplay)\/(\d+)/i,
      );
      const seriesKey = playbackSeriesMatch ? `pb:${playbackSeriesMatch[1]}` : key;

      if (seen.has(seriesKey)) {
        continue;
      }

      const imageTag = tag.match(/<img\b[^>]*>/i)?.[0];
      const coverCandidate =
        getAttribute(tag, 'data-original') ??
        getAttribute(tag, 'data-src') ??
        (imageTag
          ? (getAttribute(imageTag, 'data-original') ??
            getAttribute(imageTag, 'data-src') ??
            getAttribute(imageTag, 'src'))
          : undefined);

      seen.add(key);
      seen.add(seriesKey);
      candidates.push({
        meta: {
          cover: coverCandidate ? resolveUrl(coverCandidate, baseUrl) : undefined,
          title: firstText(
            getAttribute(tag, 'title'),
            getAttribute(tag, 'aria-label'),
            stripHtmlTags(removeHtmlAttribute(removeHtmlAttribute(tag, 'src'), 'data-src')),
          ),
        },
        url: resolved,
      });
    }
  }

  return candidates;
};

const extractNavigationLinks = (
  html: string,
  baseUrl: string,
  maxPageNumber: number,
  anchorTags = collectAnchorTags(html),
) => {
  const candidates: ChildPageLink[] = [];
  const anchors = anchorTags;
  const seen = new Set<string>();

  for (const tag of anchors) {
    const href = getAttribute(tag, 'href');

    if (!href || /^(javascript|mailto|tel|data|blob|file):/i.test(href.trim())) {
      continue;
    }

    const resolved = resolveUrl(href, baseUrl);

    if (!resolved || !isHttpUrl(resolved) || !isSameOrigin(resolved, baseUrl)) {
      continue;
    }

    if (NON_CONTENT_RESOURCE_PATTERN.test(resolved) || !isNavigationCollectionPageUrl(resolved)) {
      continue;
    }

    if (matchesExcludedUrl(resolved)) {
      // Skip excluded category navigation pages (e.g. /type/jilu).
      continue;
    }

    const key = resolved.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    const meta = {
      rawCategory: firstText(
        getAttribute(tag, 'title'),
        getAttribute(tag, 'aria-label'),
        stripHtmlTags(tag),
      ),
    };
    const dynamicPageNumber = getDynamicNavigationPageNumber(anchorTags, resolved, maxPageNumber);
    const urls = [resolved, ...buildNavigationPaginationUrls(resolved, dynamicPageNumber)];

    for (const url of urls) {
      const urlKey = url.toLowerCase();

      if (seen.has(urlKey)) {
        continue;
      }

      seen.add(urlKey);
      candidates.push({
        meta,
        url,
      });
    }
  }

  if (isNavigationCollectionPageUrl(baseUrl)) {
    const dynamicPageNumber = getDynamicNavigationPageNumber(anchorTags, baseUrl, maxPageNumber);

    for (const url of buildNavigationPaginationUrls(baseUrl, dynamicPageNumber)) {
      const urlKey = url.toLowerCase();

      if (seen.has(urlKey)) {
        continue;
      }

      seen.add(urlKey);
      candidates.push({
        meta: {
          rawCategory: undefined,
        },
        url,
      });
    }
  }

  return candidates;
};

const parseCount = (value?: string) => {
  const normalizedValue = normalizeWhitespace(value)?.replace(/,/g, '');

  if (!normalizedValue) {
    return undefined;
  }

  const match = normalizedValue.match(/([0-9]+(?:\.[0-9]+)?)\s*(万|w|k|千)?/i);

  if (!match) {
    return undefined;
  }

  const number = Number.parseFloat(match[1]);
  const unit = match[2]?.toLowerCase();

  if (unit === '万' || unit === 'w') {
    return Math.round(number * 10_000);
  }

  if (unit === 'k' || unit === '千') {
    return Math.round(number * 1_000);
  }

  return Math.round(number);
};

const splitListText = (value?: string) =>
  (value ?? '')
    .split(/[,|/]+|\p{Punctuation}+/u)
    .map((item) => normalizeWhitespace(decodeHtmlEntities(item)))
    .filter((item): item is string => Boolean(item));

const isLikelyCategoryTag = (value?: string) => {
  const normalized = normalizeWhitespace(value);

  if (!normalized || normalized.length > 28 || NON_CATEGORY_TAG_PATTERN.test(normalized)) {
    return false;
  }

  return CATEGORY_TAG_PATTERN.test(normalized);
};

const removeHtmlAttribute = (tag: string, attribute: string) =>
  tag.replace(new RegExp(`\\s${attribute}\\s*=\\s*(['"])(.*?)\\1`, 'gi'), '');

const collectLinkedTagsFromAnchors = (anchorTags: string[]) => {
  const tags = anchorTags
    .filter((tag) => {
      const rel = getAttribute(tag, 'rel')?.toLowerCase();
      const href = getAttribute(tag, 'href')?.toLowerCase();
      const className = getAttribute(tag, 'class')?.toLowerCase();

      return (
        rel === 'tag' ||
        href?.includes('tag') ||
        href?.includes('category') ||
        className?.includes('tag') ||
        className?.includes('category')
      );
    })
    .map((tag) => {
      const title = getAttribute(tag, 'title');
      const text = tag.match(/>([^<]+)</)?.[1];
      return normalizeWhitespace(decodeHtmlEntities(title ?? text));
    })
    .filter((tag): tag is string => Boolean(tag));

  return [...new Set(tags)];
};

const collectAnchorTags = (html: string): string[] => html.match(TOKENIZE_ANCHOR_PATTERN) ?? [];

const extractPage = (
  html: string,
  url: string,
  fallbackProvider?: string,
  anchorTagsOverride?: string[],
  tokensOverride?: PageTokens,
): ExtractedPage => {
  const hostname = new URL(url).hostname;
  const tokens = tokensOverride ?? tokenizeHtmlPage(html, url);
  const anchorTags = anchorTagsOverride ?? tokens.anchorTags;
  const title = firstText(
    tokens.title,
    getStructuredDataTextContentFromTokens(tokens, ['name', 'headline']),
  );
  const cover = getMetaOrStructuredTextFromTokens(
    tokens,
    ['og:image', 'twitter:image', 'thumbnailUrl', 'image'],
    ['thumbnailUrl', 'thumbnail', 'image'],
  );
  const description = getMetaOrStructuredTextFromTokens(
    tokens,
    ['description', 'og:description', 'twitter:description'],
    ['description'],
  );
  const provider =
    firstText(getMetaContentFromTokens(tokens, ['og:site_name', 'application-name'])) ??
    fallbackProvider ??
    hostname;
  const author = getMetaOrStructuredTextFromTokens(
    tokens,
    ['author', 'article:author', 'video:actor'],
    ['author', 'creator', 'director'],
  );
  const publishedAt = getMetaOrStructuredTextFromTokens(
    tokens,
    [
      'article:published_time',
      'datePublished',
      'datepublished',
      'date',
      'pubdate',
      'publishdate',
      'publish_date',
      'video:release_date',
    ],
    ['datePublished', 'uploadDate', 'dateCreated', 'dateModified'],
  );
  const metaTags = getMetaListContentFromTokens(tokens, [
    'category',
    'keywords',
    'news_keywords',
    'article:tag',
    'video:tag',
    'video:category',
    'tags',
  ]);
  const structuredTags = getStructuredDataListContentFromTokens(tokens, [
    'keywords',
    'tag',
    'tags',
  ]);
  const linkedTags = collectLinkedTagsFromAnchors(anchorTags);
  const tags = [...new Set([...metaTags, ...structuredTags, ...linkedTags])];
  const structuredCategories = getStructuredDataListContentFromTokens(tokens, [
    'articleSection',
    'category',
    'genre',
  ]);
  const rawCategory =
    getMetaContentFromTokens(tokens, [
      'article:section',
      'category',
      'video:category',
      'og:section',
      'section',
      'genre',
    ]) ??
    structuredCategories[0] ??
    tags.find(isLikelyCategoryTag);
  const playCount = parseCount(
    getMetaContentFromTokens(tokens, [
      'view_count',
      'viewCount',
      'play_count',
      'playCount',
      'video:play_count',
    ]),
  );
  const danmakuCount = parseCount(
    getMetaContentFromTokens(tokens, ['danmaku_count', 'danmakuCount', 'comment_count']),
  );
  const scriptLiterals = collectScriptLiteralMediaUrlsFromTokens(tokens, url);
  const mediaUrls = dedupeValues(
    [
      ...tokens.mediaAttributeUrls,
      ...tokens.mediaStructuredUrls,
      ...tokens.mediaPlainTextUrls
        .map((value) => normalizeMediaUrl(value, url))
        .filter((value): value is string => Boolean(value)),
      ...scriptLiterals.directCandidates,
    ],
    (value) => value.toLowerCase(),
  );
  const unsupportedMediaUrls = dedupeValues(
    [
      ...tokens.unsupportedAttributeUrls,
      ...tokens.unsupportedStructuredUrls,
      ...tokens.unsupportedPlainTextUrls
        .map((value) => normalizeUnsupportedMediaUrl(value, url))
        .filter((value): value is string => Boolean(value)),
      ...scriptLiterals.unsupportedCandidates,
    ],
    (value) => value.toLowerCase(),
  ).filter((unsupportedUrl) => !mediaUrls.includes(unsupportedUrl));

  const playbackInfo = parsePlaybackUrl(url);
  const detailInfo = parseDetailUrl(url);
  const isDetailLikePage = canCreateFallbackVideoForPage(url) && !playbackInfo;
  const anchorPlaybackLinks = isDetailLikePage
    ? collectAllPlaybackLinks(html, url, anchorTags)
    : [];
  const macCmsPlaybackLinks = isDetailLikePage ? collectMacCmsPlaylistFromTokens(tokens, url) : [];
  const mergedPlaybackLinks = (() => {
    if (!isDetailLikePage) {
      return [] as PlaybackLinkInfo[];
    }

    const seen = new Set<string>();
    const combined: PlaybackLinkInfo[] = [];

    for (const info of [...macCmsPlaybackLinks, ...anchorPlaybackLinks]) {
      const key = `${info.line}:${info.episode}:${info.url.toLowerCase()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      combined.push(info);
    }

    return combined;
  })();
  const inferredSeriesId =
    mergedPlaybackLinks.length > 0 ? inferDetailSeriesId(mergedPlaybackLinks) : undefined;
  const seriesId = playbackInfo?.seriesId ?? detailInfo?.seriesId ?? inferredSeriesId;
  const playListResult = (():
    | { tooManyEpisodes: true; playList: undefined }
    | { tooManyEpisodes: false; playList: PlaybackLinkInfo[] | undefined } => {
    if (mergedPlaybackLinks.length === 0) {
      return { tooManyEpisodes: false, playList: undefined };
    }

    const targetSeriesId = detailInfo?.seriesId ?? inferredSeriesId;
    const filtered = collectPlaybackLinksForSeries(mergedPlaybackLinks, targetSeriesId);

    if (filtered.length === 0) {
      return { tooManyEpisodes: false, playList: undefined };
    }

    const episodesPerLine = new Map<number, Set<number>>();
    for (const info of filtered) {
      const lineEpisodes = episodesPerLine.get(info.line) ?? new Set<number>();
      lineEpisodes.add(info.episode);
      episodesPerLine.set(info.line, lineEpisodes);
    }

    let maxEpisodesInOneLine = 0;
    for (const lineEpisodes of episodesPerLine.values()) {
      if (lineEpisodes.size > maxEpisodesInOneLine) {
        maxEpisodesInOneLine = lineEpisodes.size;
      }
    }

    if (maxEpisodesInOneLine > MAX_EPISODES_PER_VIDEO) {
      return { tooManyEpisodes: true, playList: undefined };
    }

    return { tooManyEpisodes: false, playList: filtered };
  })();
  const { playList, tooManyEpisodes } = playListResult;

  return {
    author,
    cover: cover ? resolveUrl(cover, url) : undefined,
    danmakuCount,
    description,
    mediaUrls,
    playCount,
    playList,
    publishedAt,
    provider,
    rawCategory,
    seriesId,
    tags,
    title,
    tooManyEpisodes,
    unsupportedMediaUrls,
  };
};

const createVideoId = (pageUrl: string, seriesId: string | undefined, index: number): string => {
  if (seriesId) {
    const cleanSeriesId = seriesId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (cleanSeriesId) {
      return `crawler-series-${cleanSeriesId}${index > 1 ? `-${index}` : ''}`;
    }
  }

  const pathSlug = pageUrl
    .replace(/^https?:\/\/[^/]+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return `crawler-${pathSlug || `idx-${index}`}${index > 1 ? `-${index}` : ''}`;
};

const getPageValidationErrors = (page: ExtractedPage, pageUrl: string): WebCrawlerError[] => {
  const errors: WebCrawlerError[] = [];
  const isVideoPage = canCreateFallbackVideoForPage(pageUrl);

  if (!page.title) {
    errors.push({
      message: 'Skipped page because no public title was found.',
      reason: 'empty-title',
      url: pageUrl,
    });
  }

  if (isVideoPage && page.mediaUrls.length === 0 && (page.playList ?? []).length === 0) {
    errors.push({
      message: 'Skipped page because no direct public media URL was found.',
      reason: 'empty-media',
      url: pageUrl,
    });
  }

  if (page.unsupportedMediaUrls.length > 0) {
    errors.push({
      message: 'Page exposed media URLs, but their formats are not supported for in-app playback.',
      reason: 'unsupported-media',
      url: pageUrl,
    });
  }

  return errors;
};

const buildPageMeta = (page: ExtractedPage): ParentPageMeta => ({
  cover: page.cover,
  description: page.description,
  rawCategory: page.rawCategory,
  tags: page.tags && page.tags.length > 0 ? page.tags : undefined,
  title: page.title,
});

const mergePlaybackParentMeta = (
  parentMeta: ParentPageMeta,
  childMeta?: ParentPageMeta,
): ParentPageMeta => ({
  ...childMeta,
  ...parentMeta,
  cover: parentMeta.cover ?? childMeta?.cover,
  description: parentMeta.description ?? childMeta?.description,
  rawCategory: parentMeta.rawCategory ?? childMeta?.rawCategory,
  tags: parentMeta.tags ?? childMeta?.tags,
  title: parentMeta.title ?? childMeta?.title,
});

const inheritExtractedPage = (page: ExtractedPage, parent?: ParentPageMeta): ExtractedPage => {
  if (!parent) {
    return page;
  }

  return {
    ...page,
    cover: page.cover ?? parent.cover,
    description: page.description ?? parent.description,
    rawCategory: page.rawCategory ?? parent.rawCategory,
    tags: page.tags && page.tags.length > 0 ? page.tags : parent.tags,
    title: page.title ?? parent.title,
  };
};

// Categories the user explicitly does not want crawled. Video sources whose
// rawCategory / tags / title / url matches any of these keywords are dropped
// from the pipeline as early as possible (in buildRawVideos) so they never
// reach the cache, the UI, or category mapping.
const EXCLUDED_CATEGORY_KEYWORDS = [
  '\u7eaa\u5f55\u7247',
  '\u7eaa\u5f55',
  '\u7eaa\u5b9e',
  '\u7eaa\u5b9e\u7247',
  'documentary',
  'docuseries',
  'jilu',
];

const EXCLUDED_URL_KEYWORDS = ['/jilu', '/jilupian', '/documentary', '/docu', 'jilu.html'];

const matchesExcludedUrl = (value: string): boolean => {
  const lowered = value.toLowerCase();
  return EXCLUDED_URL_KEYWORDS.some((keyword) => lowered.includes(keyword));
};

const matchesExcludedCategory = (page: ExtractedPage, pageUrl: string): boolean => {
  const haystack = [page.rawCategory, page.title, page.description, pageUrl, ...(page.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return EXCLUDED_CATEGORY_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
};

const buildRawVideos = (
  page: ExtractedPage,
  pageUrl: string,
  parentMeta?: ParentPageMeta,
): RawVideoSource[] => {
  const title = page.title ?? parentMeta?.title;

  if (!title) {
    return [];
  }

  // Series exceeded the per-video episode cap — drop the entire card so
  // it never shows up in the list (no fallback to a single-episode card).
  if (page.tooManyEpisodes) {
    return [];
  }

  // Hard-skip categories the user wants excluded (e.g. documentaries).
  if (matchesExcludedCategory(page, pageUrl)) {
    return [];
  }

  const cover = page.cover ?? parentMeta?.cover;
  const description = page.description ?? parentMeta?.description;
  const rawCategory = page.rawCategory ?? parentMeta?.rawCategory;
  const tags = page.tags && page.tags.length > 0 ? page.tags : parentMeta?.tags;
  const playbackInfo = parsePlaybackUrl(pageUrl);
  const seriesId = page.seriesId ?? playbackInfo?.seriesId;

  if (page.mediaUrls.length === 0) {
    if (page.playList && page.playList.length > 0 && seriesId) {
      const fallbackPlayLines = buildPlayLinesFromInfos(page.playList);
      const firstEpisode = page.playList[0];

      return [
        {
          id: createVideoId(pageUrl, seriesId, 1),
          title,
          source: firstEpisode.url,
          webViewUrl: pageUrl,
          author: page.author,
          cover,
          createdAt: page.publishedAt,
          danmakuCount: page.danmakuCount,
          description,
          format: 'unknown',
          playLines: fallbackPlayLines,
          provider: page.provider,
          rawCategory,
          seriesId,
          sourceType: 'unsupported',
          tags,
          playCount: page.playCount,
        },
      ];
    }

    if (!canCreateFallbackVideoForPage(pageUrl)) {
      return [];
    }

    const unsupportedSource = page.unsupportedMediaUrls[0] ?? pageUrl;
    const unsupportedFormat = getFormatFromUrl(unsupportedSource) ?? 'unknown';

    return [
      {
        id: createVideoId(pageUrl, seriesId, 1),
        title,
        source: unsupportedSource,
        webViewUrl: pageUrl,
        author: page.author,
        cover,
        createdAt: page.publishedAt,
        danmakuCount: page.danmakuCount,
        description,
        format: unsupportedFormat,
        provider: page.provider,
        rawCategory,
        seriesId,
        sourceType: 'unsupported',
        tags,
        playCount: page.playCount,
      },
    ];
  }

  return page.mediaUrls.flatMap((source, index) => {
    const format = getFormatFromUrl(source);

    if (!format) {
      return [];
    }

    const playLines =
      playbackInfo && index === 0
        ? [
            {
              episodes: [
                {
                  episode: playbackInfo.episode,
                  episodeLabel: `\u7b2c${playbackInfo.episode}\u96c6`,
                  format,
                  mediaUrl: source,
                  playPageUrl: pageUrl,
                  sourceType: getSourceType(format),
                },
              ],
              label: `\u7ebf\u8def${playbackInfo.line}`,
              line: playbackInfo.line,
            },
          ]
        : undefined;

    return {
      id: createVideoId(pageUrl, seriesId, index + 1),
      title: page.mediaUrls.length > 1 ? `${title} ${index + 1}` : title,
      source,
      webViewUrl: pageUrl,
      author: page.author,
      cover,
      createdAt: page.publishedAt,
      danmakuCount: page.danmakuCount,
      description,
      format,
      playLines,
      provider: page.provider,
      rawCategory,
      seriesId,
      sourceType: getSourceType(format),
      tags,
      playCount: page.playCount,
    };
  });
};

const buildPaginatedUrls = (baseUrl: string, page?: WebCrawlerPageConfig) => {
  if (!page?.enabled) {
    return [baseUrl];
  }

  const startPage = page.startPage ?? 1;
  const maxPages = Math.max(1, page.maxPages ?? 1);

  return Array.from({ length: maxPages }, (_, index) => {
    const pageNumber = startPage + index;

    if (page.buildPageUrl) {
      return page.buildPageUrl(baseUrl, pageNumber);
    }

    const url = new URL(baseUrl);
    url.searchParams.set(page.pageParam ?? 'page', String(pageNumber));

    return url.toString();
  });
};

const buildConfiguredPageFallbackVideo = (
  source: AuthorizedWebPageSourceConfig,
): RawVideoSource | undefined => {
  if (!isHttpUrl(source.url) || !canCreateFallbackVideoForPage(source.url)) {
    return undefined;
  }

  const pathname = getUrlPathname(source.url);
  const fallbackTitle = decodeURIComponent(
    pathname
      .replace(/\/+/g, ' ')
      .replace(/\.html?$/i, '')
      .trim(),
  );

  const detailInfo = parseDetailUrl(source.url);
  const fallbackSeriesId = detailInfo?.seriesId;

  return {
    id: createVideoId(source.url, fallbackSeriesId, 1),
    title: fallbackTitle || source.provider || new URL(source.url).hostname,
    source: source.url,
    webViewUrl: source.url,
    format: 'unknown',
    provider: source.provider,
    sourceType: 'unsupported',
    seriesId: fallbackSeriesId,
  };
};

const collectRequestUrlState = (urls: string[], page?: WebCrawlerPageConfig) => {
  const invalidUrls = urls.filter((url) => !isHttpUrl(url));
  const requestUrls = urls
    .filter(isHttpUrl)
    .flatMap((url) => buildPaginatedUrls(url, page))
    .flatMap((url) => {
      const normalizedUrl = resolveUrl(url, url);

      if (!normalizedUrl || !isHttpUrl(normalizedUrl)) {
        invalidUrls.push(url);
        return [];
      }

      return [normalizedUrl];
    });

  return {
    invalidUrls: dedupeValues(invalidUrls, (url) => url.trim().toLowerCase()),
    requestUrls: dedupeValues(requestUrls, (url) => url.toLowerCase()),
  };
};

const DIRECT_MEDIA_FRAGMENT_PATTERN = /\.(mp4|m3u8|mov|m4v|mkv|webm)(?:[?#][^\s"'<>]*)?/i;
const SCRIPT_MEDIA_FIELD_FRAGMENT_PATTERN =
  /["'](?:url|file|source|src|video|videoUrl|playUrl|play_url|m3u8|hls|videoSrc|mediaUrl|media_url|stream)["']\s*:\s*["'][^"']+/i;
const DETAIL_LINK_FRAGMENT_PATTERN =
  /\/(?:video|movie|film|detail|view|item|drama|anime|tv|show|content|info|voddetail)\/[^"'<>\s]+/i;

const hasUsefulPartialHtml = (html: string, pageUrl: string) =>
  (html.length >= MIN_PLAYBACK_HTML_LENGTH && DIRECT_MEDIA_FRAGMENT_PATTERN.test(html)) ||
  (html.length >= MIN_PLAYBACK_HTML_LENGTH && SCRIPT_MEDIA_FIELD_FRAGMENT_PATTERN.test(html)) ||
  (!canCreateFallbackVideoForPage(pageUrl) &&
    html.length >= MIN_LIST_HTML_LENGTH &&
    DETAIL_LINK_FRAGMENT_PATTERN.test(html));

const safeSetRequestHeader = (request: XMLHttpRequest, key: string, value: string) => {
  try {
    request.setRequestHeader(key, value);
  } catch {
    // Browser-like runtimes can reject restricted headers such as User-Agent.
  }
};

const createAbortError = () =>
  Object.assign(new Error('This operation was aborted'), {
    name: 'AbortError',
  });

const readHtmlWithXhr = (url: string, options: WebCrawlerOptions, signal: AbortSignal) =>
  new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let lastPartialProbeLength = 0;
    let progressEventCounter = 0;
    let settled = false;

    const cleanup = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }

      signal.removeEventListener('abort', handleAbort);
    };

    const getTextLength = () => Math.min(request.responseText?.length ?? 0, MAX_HTML_LENGTH);
    const getText = () => (request.responseText || '').slice(0, MAX_HTML_LENGTH);

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const resolvePartial = () => {
      const text = getText();

      if (!text) {
        return;
      }

      settle(() => {
        resolve(text);

        try {
          request.abort();
        } catch {
          // The request may already be closed.
        }
      });
    };

    const scheduleIdleResolve = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }

      idleTimer = setTimeout(resolvePartial, HTML_STREAM_IDLE_MS);
    };

    function handleAbort() {
      if (getTextLength() > 0) {
        resolvePartial();
        return;
      }

      settle(() => {
        try {
          request.abort();
        } catch {
          // The request may already be closed.
        }

        reject(createAbortError());
      });
    }

    request.open('GET', url, true);
    request.timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    safeSetRequestHeader(request, 'Accept', 'text/html,application/xhtml+xml');
    safeSetRequestHeader(request, 'Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
    safeSetRequestHeader(request, 'User-Agent', CRAWLER_USER_AGENT);

    request.onreadystatechange = () => {
      if (request.readyState === XMLHttpRequest.HEADERS_RECEIVED && request.status >= 400) {
        settle(() =>
          reject(
            Object.assign(new Error(`Request failed with status ${request.status}.`), {
              status: request.status,
            }),
          ),
        );
        return;
      }

      if (request.readyState === XMLHttpRequest.DONE) {
        if (request.status >= 200 && request.status < 300) {
          resolvePartial();
          return;
        }

        settle(() =>
          reject(
            Object.assign(new Error(`Request failed with status ${request.status}.`), {
              status: request.status,
            }),
          ),
        );
      }
    };

    request.onprogress = () => {
      progressEventCounter += 1;

      if (progressEventCounter % XHR_PROGRESS_PROBE_INTERVAL !== 0) {
        return;
      }

      const textLength = getTextLength();

      if (shouldProbePartialHtml(textLength, url, lastPartialProbeLength)) {
        lastPartialProbeLength = textLength;

        if (hasUsefulPartialHtml(getText(), url)) {
          resolvePartial();
          return;
        }
      }

      if (textLength > 0) {
        scheduleIdleResolve();
      }
    };

    request.onerror = () => settle(() => reject(new Error('fetch failed')));
    request.ontimeout = handleAbort;
    request.onabort = () => {
      if (!settled) {
        handleAbort();
      }
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    request.send();
  });

const readHtmlBody = async (response: Response, pageUrl: string) => {
  const streamReader = response.body?.getReader?.();

  if (!streamReader) {
    return (await response.text()).slice(0, MAX_HTML_LENGTH);
  }

  const decoder = new TextDecoder('utf-8');
  let accumulatedText = '';
  let lastPartialProbeLength = 0;
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_HTML_LENGTH) {
      const result = await Promise.race([
        streamReader.read(),
        new Promise<{ idle: true }>((resolve) =>
          setTimeout(() => resolve({ idle: true }), HTML_STREAM_IDLE_MS),
        ),
      ]);

      if ('idle' in result) {
        break;
      }

      if (result.done) {
        break;
      }

      const remainingBudget = MAX_HTML_LENGTH - totalBytes;
      const chunk =
        result.value.length > remainingBudget
          ? result.value.slice(0, remainingBudget)
          : result.value;

      totalBytes += chunk.length;
      accumulatedText += decoder.decode(chunk, { stream: true });

      if (!shouldProbePartialHtml(accumulatedText.length, pageUrl, lastPartialProbeLength)) {
        continue;
      }

      lastPartialProbeLength = accumulatedText.length;

      if (hasUsefulPartialHtml(accumulatedText, pageUrl)) {
        break;
      }
    }

    accumulatedText += decoder.decode();
  } finally {
    try {
      await streamReader.cancel();
    } catch {
      // Some fetch implementations throw after the response has already closed.
    }
  }

  return accumulatedText.slice(0, MAX_HTML_LENGTH);
};

const fetchWithBuiltInFetch = async (url: string, signal: AbortSignal) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': CRAWLER_USER_AGENT,
    },
    signal,
  });

  if (!response.ok) {
    throw Object.assign(new Error(`Request failed with status ${response.status}.`), {
      status: response.status,
    });
  }

  return readHtmlBody(response, url);
};

const getBackoffRemaining = (state: CrawlState, hostname: string): number => {
  const until = state.backoffUntilAt.get(hostname) ?? 0;
  const now = Date.now();
  return until > now ? until - now : 0;
};

const getHostBackoffDuration = (attempt: number) => {
  const baseDuration = Math.min(
    HOST_BACKOFF_MAX_MS,
    HOST_BACKOFF_BASE_MS * Math.pow(HOST_BACKOFF_GROWTH, Math.max(0, attempt - 1)),
  );
  const jitter = Math.round(baseDuration * HOST_BACKOFF_JITTER_RATIO * Math.random());

  return Math.round(baseDuration + jitter);
};

const recordHostBackoff = (state: CrawlState, hostname: string, durationMs?: number) => {
  const attempt = (state.backoffCounts.get(hostname) ?? 0) + 1;
  state.backoffCounts.set(hostname, attempt);

  const until = Date.now() + (durationMs ?? getHostBackoffDuration(attempt));
  const existing = state.backoffUntilAt.get(hostname) ?? 0;

  if (until > existing) {
    state.backoffUntilAt.set(hostname, until);
  }
};

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
};

const getCrawlerDiscoveredPageKind = (url: string): CrawlerDiscoveredPageKind => {
  if (isPlaybackPageUrl(url)) {
    return 'playback';
  }

  if (isVideoDetailPageUrl(url)) {
    return 'detail';
  }

  if (isNavigationCollectionPageUrl(url)) {
    return 'navigation';
  }

  if (isDirectMediaUrl(url) || isUnsupportedMediaUrl(url)) {
    return 'media';
  }

  return 'other';
};

const recordCrawlerDiscoveredPage = (
  state: CrawlState,
  page: Omit<CrawlerDiscoveredPage, 'firstSeenAt' | 'lastSeenAt'>,
) => {
  const now = Date.now();

  state.discoveredPages.push({
    ...page,
    firstSeenAt: now,
    lastSeenAt: now,
  });
};

const recordCrawlerChildPages = (
  context: CrawlContext,
  parentUrl: string,
  depth: number,
  children: ChildPageLink[],
  status: CrawlerDiscoveredPageStatus = 'pending',
) => {
  for (const child of children) {
    recordCrawlerDiscoveredPage(context.state, {
      depth,
      kind: getCrawlerDiscoveredPageKind(child.url),
      parentUrl,
      priority: getChildPriorityScore(child, context, context.parentMeta?.priorityBoost ?? 0),
      rawCategory: child.meta?.rawCategory,
      sourceUrl: context.sourceUrl,
      status,
      title: child.meta?.title,
      url: child.url,
    });
  }
};

const hostFetchQueues = new Map<string, Promise<unknown>[]>();

const HOST_MAX_IN_FLIGHT = 3;

const waitForHostSlot = async (hostname: string) => {
  const queue = hostFetchQueues.get(hostname);

  if (!queue) {
    return;
  }

  while (queue.length >= HOST_MAX_IN_FLIGHT) {
    await Promise.race(queue).catch(() => undefined);
  }
};

const runWithHostRateLimit = async <T>(
  url: string,
  intervalMs: number,
  task: () => Promise<T>,
): Promise<T> => {
  const hostname = getHostname(url);

  if (!hostname) {
    return task();
  }

  const queue = hostFetchQueues.get(hostname) ?? [];

  if (!hostFetchQueues.has(hostname)) {
    hostFetchQueues.set(hostname, queue);
  }

  await waitForHostSlot(hostname);

  if (intervalMs > 0) {
    await delay(intervalMs);
  }

  const inFlight = task();
  const tracked = inFlight.catch(() => undefined);
  queue.push(tracked);

  try {
    return await inFlight;
  } finally {
    const index = queue.indexOf(tracked);
    if (index >= 0) {
      queue.splice(index, 1);
    }
    if (queue.length === 0) {
      hostFetchQueues.delete(hostname);
    }
  }
};

const fetchHtmlWithoutRateLimit = async (url: string, options: WebCrawlerOptions) => {
  const timeout = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? mergeSignals([options.signal, timeout.signal]) : timeout.signal;
  const startedAt = Date.now();
  const canUseXhr = typeof XMLHttpRequest !== 'undefined';
  const transports: ('xhr' | 'fetch')[] = canUseXhr ? ['fetch', 'xhr'] : ['fetch'];

  crawlerLog('[crawler] fetch start', url, 'transports=', transports.join(','));

  let lastError: unknown;

  try {
    for (let attempt = 0; attempt < transports.length; attempt += 1) {
      const transport = transports[attempt];

      try {
        const html =
          transport === 'xhr'
            ? await readHtmlWithXhr(url, options, signal)
            : await fetchWithBuiltInFetch(url, signal);

        crawlerLog(
          '[crawler] fetch ok',
          url,
          'via=',
          transport,
          'len=',
          html.length,
          'ms=',
          Date.now() - startedAt,
        );

        return html;
      } catch (error) {
        lastError = error;

        if (signal.aborted) {
          throw error;
        }

        const status = (error as { status?: number }).status;
        if (typeof status === 'number' && status >= 400 && status < 600) {
          throw error;
        }

        crawlerWarn(
          '[crawler] fetch retry',
          url,
          'via=',
          transport,
          error instanceof Error ? error.message : String(error),
        );

        if (attempt + 1 < transports.length) {
          await delay(FETCH_RETRY_DELAY_MS);
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : Object.assign(new Error('Failed to crawl web page.'), {
          cause: lastError,
        });
  } catch (error) {
    crawlerWarn(
      '[crawler] fetch failed',
      url,
      error instanceof Error ? error.message : String(error),
      'ms=',
      Date.now() - startedAt,
    );
    throw error;
  } finally {
    timeout.cleanup();
  }
};

const fetchHtml = async (url: string, options: WebCrawlerOptions) => {
  // List / navigation pages keep the configured interval (they're the most
  // sensitive to host rate-limit) but detail / playback pages — where the
  // actual cards come from — use a near-zero interval so the host queue's
  // concurrency cap (HOST_MAX_IN_FLIGHT) is the real throttle.
  const intervalMs = canCreateFallbackVideoForPage(url)
    ? 30
    : (options.crawlIntervalMs ?? DEFAULT_INTERVAL_MS);

  return runWithHostRateLimit(url, intervalMs, () => fetchHtmlWithoutRateLimit(url, options));
};

const getChildPriorityScore = (
  child: ChildPageLink,
  context: CrawlContext,
  parentBoost: number,
): number => {
  let score = child.priority ?? 0;
  score += child.meta?.priorityBoost ?? 0;
  score += parentBoost;

  if (isPlaybackPageUrl(child.url)) {
    score += 2000;
  } else if (isVideoDetailPageUrl(child.url) && !isPlaybackPageUrl(child.url)) {
    score += 1500;
  }

  const path = getUrlPathname(child.url).toLowerCase();

  if (context.priorityPathPatterns) {
    for (const rule of context.priorityPathPatterns) {
      if (rule.pattern.test(path)) {
        score += rule.score;
      }
    }
  }

  return score;
};

const crawlPageRecursive = async (
  url: string,
  depth: number,
  context: CrawlContext,
): Promise<void> => {
  if (context.options.signal?.aborted) {
    return;
  }

  const shouldDiscoverNavigationAfterEnoughVideos =
    context.options.discoverNavigationAfterEnoughVideos === true;
  const discoveryOnly =
    shouldDiscoverNavigationAfterEnoughVideos &&
    hasEnoughVideos(context.state) &&
    canDiscoverNavigationAfterEnoughVideos(url);

  if (hasEnoughVideos(context.state) && !discoveryOnly) {
    return;
  }

  const visitKey = url.toLowerCase();

  if (context.state.visited.has(visitKey)) {
    return;
  }

  if (context.state.budgetRemaining <= 0) {
    return;
  }

  const hostname = getHostname(url);
  const backoffRemaining = hostname ? getBackoffRemaining(context.state, hostname) : 0;

  if (backoffRemaining > 0) {
    recordCrawlerDiscoveredPage(context.state, {
      depth,
      kind: getCrawlerDiscoveredPageKind(url),
      priority: context.parentMeta?.priorityBoost ?? 0,
      rawCategory: context.parentMeta?.rawCategory,
      sourceUrl: context.sourceUrl,
      status: 'backoff',
      title: context.parentMeta?.title,
      url,
    });
    context.state.errors.push({
      message: `Skipped page because host is on backoff for ${backoffRemaining}ms.`,
      reason: 'request-failed',
      url,
    });
    return;
  }

  context.state.visited.add(visitKey);
  context.state.budgetRemaining -= 1;
  recordCrawlerDiscoveredPage(context.state, {
    depth,
    kind: getCrawlerDiscoveredPageKind(url),
    priority: context.parentMeta?.priorityBoost ?? 0,
    rawCategory: context.parentMeta?.rawCategory,
    sourceUrl: context.sourceUrl,
    status: 'visited',
    title: context.parentMeta?.title,
    url,
  });

  if (context.state.visited.size > 1) {
    await yieldToEventLoop();
  }

  let html: string;

  try {
    html = await fetchHtml(url, context.options);
  } catch (error) {
    const maybeStatus = error as { status?: number };

    if (
      hostname &&
      typeof maybeStatus.status === 'number' &&
      (maybeStatus.status === 403 || maybeStatus.status === 429 || maybeStatus.status === 503)
    ) {
      recordHostBackoff(context.state, hostname);
    }

    recordCrawlerDiscoveredPage(context.state, {
      depth,
      kind: getCrawlerDiscoveredPageKind(url),
      priority: context.parentMeta?.priorityBoost ?? 0,
      rawCategory: context.parentMeta?.rawCategory,
      sourceUrl: context.sourceUrl,
      status: 'failed',
      title: context.parentMeta?.title,
      url,
    });
    context.state.errors.push({
      message: error instanceof Error ? error.message : 'Failed to crawl web page.',
      reason: 'request-failed',
      status: maybeStatus.status,
      url,
    });

    return;
  }

  await yieldAfterLargeHtmlStep(html);

  const tokens = await tokenizeHtmlPageInBatches(html, url);
  const anchorTags = tokens.anchorTags;

  await yieldAfterLargeHtmlStep(html);

  const rawPage = extractPage(html, url, context.provider, anchorTags, tokens);
  const inheritedPage = inheritExtractedPage(rawPage, context.parentMeta);
  const builtVideos = buildRawVideos(inheritedPage, url, context.parentMeta);
  const isDetailWithPlayList = Boolean(
    inheritedPage.playList && inheritedPage.playList.length > 0 && inheritedPage.seriesId,
  );

  await yieldAfterLargeHtmlStep(html);

  const iframeChildren = collectIframeSrcs(html, url).map(
    (childUrl): ChildPageLink => ({
      meta: buildPageMeta(inheritedPage),
      url: childUrl,
    }),
  );
  const metaChildren = collectMetaLinkedUrls(html, url)
    .filter(
      (childUrl) =>
        (isSameOrigin(childUrl, url) || isPlaybackPageUrl(childUrl)) &&
        canCreateFallbackVideoForPage(childUrl),
    )
    .map(
      (childUrl): ChildPageLink => ({
        meta: buildPageMeta(inheritedPage),
        url: childUrl,
      }),
    );
  const detailChildren = isDetailWithPlayList ? [] : extractDetailLinks(html, url, anchorTags);
  const navigationPageNumber = Math.max(
    1,
    context.options.maxNavigationPageNumber ?? DEFAULT_MAX_NAVIGATION_PAGE_NUMBER,
  );

  await yieldAfterLargeHtmlStep(html);

  const navigationChildren = isDetailWithPlayList
    ? []
    : extractNavigationLinks(html, url, navigationPageNumber, anchorTags);
  const childCap = Math.max(1, context.options.maxChildrenPerPage ?? DEFAULT_MAX_CHILDREN_PER_PAGE);
  const navigationCap = Math.max(
    0,
    context.options.maxNavigationPages ?? DEFAULT_MAX_NAVIGATION_PAGES,
  );
  let childLinks: ChildPageLink[] = [];
  const parentBoost = context.parentMeta?.priorityBoost ?? 0;
  const playlistChildren =
    isDetailWithPlayList && inheritedPage.playList
      ? inheritedPage.playList.map(
          (info): ChildPageLink => ({
            meta: buildPageMeta(inheritedPage),
            url: info.url,
          }),
        )
      : [];

  if (playlistChildren.length > 0) {
    recordCrawlerChildPages(context, url, Math.max(0, depth - 1), playlistChildren);
  }

  if (isDetailWithPlayList) {
    // Lazy-load strategy: a detail page with a playList already gives us
    // every (line, episode) playPageUrl. We do NOT follow any playback
    // page during crawl — the user-side `fetchEpisodeMediaUrl` will be
    // called only when the user opens the player. This cuts per-card
    // fetches from 3-5 down to 1 and lets the crawler hit far more cards
    // in the same time budget.
    childLinks = [];
  } else {
    const directCandidates = dedupeValues(
      [...metaChildren, ...iframeChildren, ...detailChildren],
      (value) => value.url.toLowerCase(),
    );
    const navigationCandidates = navigationChildren;

    recordCrawlerChildPages(
      context,
      url,
      Math.max(0, depth - 1),
      dedupeValues([...directCandidates, ...navigationCandidates], (value) =>
        value.url.toLowerCase(),
      ),
    );

    const rankedDirect = directCandidates
      .filter((child) => !context.state.visited.has(child.url.toLowerCase()))
      .map((child) => ({
        child,
        score: getChildPriorityScore(child, context, parentBoost),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, childCap)
      .map(({ child, score }) => ({ ...child, priority: score }));
    const rankedNavigation = navigationCandidates
      .filter((child) => !context.state.visited.has(child.url.toLowerCase()))
      .map((child) => ({
        child,
        score: getChildPriorityScore(child, context, parentBoost),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, navigationCap)
      .map(({ child, score }) => ({ ...child, priority: score }));

    childLinks = dedupeValues([...rankedDirect, ...rankedNavigation], (value) =>
      value.url.toLowerCase(),
    );
  }

  crawlerLog(
    '[crawler] parsed',
    url,
    'depth=',
    depth,
    'media=',
    inheritedPage.mediaUrls.length,
    'children=',
    childLinks.length,
    'playList=',
    inheritedPage.playList?.length ?? 0,
    'detail=',
    detailChildren.length,
    'nav=',
    navigationChildren.length,
    'iframe=',
    iframeChildren.length,
    'meta=',
    metaChildren.length,
    'title=',
    inheritedPage.title ? 'yes' : 'no',
  );

  if (discoveryOnly) {
    return;
  }

  if (inheritedPage.mediaUrls.length > 0) {
    context.state.errors.push(...getPageValidationErrors(inheritedPage, url));
    addVideos(context, builtVideos);
    return;
  }

  if (depth <= 0 || context.state.budgetRemaining <= 0) {
    context.state.errors.push(...getPageValidationErrors(inheritedPage, url));
    addVideos(context, builtVideos);
    return;
  }

  if (childLinks.length === 0) {
    context.state.errors.push(...getPageValidationErrors(inheritedPage, url));
    addVideos(context, builtVideos);
    return;
  }

  if (isDetailWithPlayList) {
    addVideos(context, builtVideos);
  }

  const videoCountBeforeChildren = context.state.videos.length;
  const concurrency = Math.max(1, context.options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

  for (let index = 0; index < childLinks.length; index += concurrency) {
    if (context.options.signal?.aborted) {
      break;
    }

    if (context.state.budgetRemaining <= 0 || hasEnoughVideos(context.state)) {
      break;
    }

    const chunk = childLinks.slice(index, index + concurrency);
    const pageMeta = buildPageMeta(inheritedPage);

    await Promise.allSettled(
      chunk.map((child) => {
        const childMeta = isPlaybackPageUrl(child.url)
          ? mergePlaybackParentMeta(pageMeta, child.meta)
          : (child.meta ?? pageMeta);
        const nextMeta: ParentPageMeta = {
          ...childMeta,
          priorityBoost: child.priority ?? childMeta?.priorityBoost ?? parentBoost,
        };

        return crawlPageRecursive(child.url, depth - 1, {
          ...context,
          parentMeta: nextMeta,
        });
      }),
    );

    await yieldToEventLoop();
  }

  if (!isDetailWithPlayList && context.state.videos.length === videoCountBeforeChildren) {
    context.state.errors.push(...getPageValidationErrors(inheritedPage, url));
    addVideos(context, builtVideos);
  }
};

const addVideos = (context: CrawlContext, items: RawVideoSource[]) => {
  if (items.length === 0) {
    return;
  }

  context.state.videos.push(...items);

  if (context.options.onProgress) {
    const now = Date.now();
    const rawCount = context.state.videos.length;
    const cardCount = getCrawlVideoCardCount(context.state.videos);
    const rawIncrement = rawCount - context.state.lastProgressRawCount;
    const cardIncrement = cardCount - context.state.lastProgressCardCount;
    const shouldEmit =
      context.state.lastProgressCardCount === 0 ||
      cardIncrement >= CRAWLER_PROGRESS_MIN_INCREMENT ||
      rawIncrement >= CRAWLER_PROGRESS_RAW_MIN_INCREMENT ||
      now - context.state.lastProgressAt >= CRAWLER_PROGRESS_MIN_INTERVAL_MS ||
      hasEnoughVideos(context.state);

    if (!shouldEmit) {
      return;
    }

    context.state.lastProgressAt = now;
    context.state.lastProgressCardCount = cardCount;
    context.state.lastProgressRawCount = rawCount;

    try {
      context.options.onProgress(context.state.videos.slice());
    } catch (error) {
      crawlerWarn(
        '[crawler] onProgress threw',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
};

export const crawlAuthorizedWebPages = async (
  options: WebCrawlerOptions,
): Promise<WebCrawlerResult> => {
  const state: CrawlState = {
    backoffUntilAt: new Map<string, number>(),
    backoffCounts: new Map<string, number>(),
    budgetRemaining: Math.max(1, options.maxDetailPages ?? DEFAULT_MAX_DETAIL_PAGES),
    discoveredPages: [],
    errors: [],
    lastProgressAt: 0,
    lastProgressCardCount: 0,
    lastProgressRawCount: 0,
    maxVideos: Math.max(1, options.maxVideos ?? Number.POSITIVE_INFINITY),
    videos: [],
    visited: new Set<string>(),
  };
  const { invalidUrls, requestUrls } = collectRequestUrlState(options.allowedUrls, options.page);

  state.errors.push(
    ...invalidUrls.map((url) => ({
      message: 'Only http and https URLs are supported.',
      reason: 'invalid-url' as const,
      url,
    })),
  );

  const depth = Math.max(0, options.crawlDepth ?? DEFAULT_CRAWL_DEPTH);
  const context: CrawlContext = {
    options,
    priorityPathPatterns: options.priorityPathPatterns,
    provider: options.provider,
    sourceUrl: options.sourceUrl,
    state,
  };

  const priorityMap = options.initialUrlPriority;
  const orderedRequestUrls =
    priorityMap && priorityMap.size > 0
      ? [...requestUrls].sort(
          (left, right) => (priorityMap.get(right) ?? 0) - (priorityMap.get(left) ?? 0),
        )
      : requestUrls;

  for (const url of orderedRequestUrls) {
    if (options.signal?.aborted) {
      break;
    }

    if (state.budgetRemaining <= 0) {
      break;
    }

    if (hasEnoughVideos(state) && options.discoverNavigationAfterEnoughVideos !== true) {
      break;
    }

    const seedPriority = priorityMap?.get(url) ?? 0;
    const seedMeta: ParentPageMeta | undefined =
      seedPriority > 0 ? { priorityBoost: seedPriority } : undefined;

    recordCrawlerDiscoveredPage(state, {
      depth,
      kind: 'seed',
      priority: seedPriority,
      sourceUrl: options.sourceUrl,
      status: 'pending',
      url,
    });

    await crawlPageRecursive(url, depth, {
      ...context,
      parentMeta: seedMeta,
    });

    await yieldToEventLoop();
  }

  return {
    discoveredPages: state.discoveredPages,
    errors: state.errors,
    videos: state.videos,
  };
};

export const countEpisodes = (playLines?: VideoPlayLine[]) =>
  (playLines ?? []).reduce((sum, line) => sum + line.episodes.length, 0);

const cloneEpisode = (episode: VideoPlayEpisode): VideoPlayEpisode => ({
  ...episode,
});

const cloneLines = (playLines?: VideoPlayLine[]): VideoPlayLine[] =>
  (playLines ?? []).map((line) => ({
    ...line,
    episodes: line.episodes.map(cloneEpisode),
  }));

const relinkSeriesIds = (videos: RawVideoSource[]): RawVideoSource[] =>
  videos.map((video) => {
    if (video.seriesId) {
      return video;
    }

    const candidates: string[] = [];

    for (const line of video.playLines ?? []) {
      for (const episode of line.episodes) {
        const parsed = parsePlaybackUrl(episode.playPageUrl);

        if (parsed?.seriesId) {
          candidates.push(parsed.seriesId);
        }
      }
    }

    if (candidates.length === 0) {
      const inferred = parsePlaybackUrl(video.source);

      if (inferred?.seriesId) {
        return { ...video, seriesId: inferred.seriesId };
      }

      return video;
    }

    const counts = new Map<string, number>();

    for (const id of candidates) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    let best: { id: string; count: number } | undefined;

    for (const [id, count] of counts) {
      if (!best || count > best.count) {
        best = { id, count };
      }
    }

    return best ? { ...video, seriesId: best.id } : video;
  });

const aggregateBySeriesId = (videos: RawVideoSource[]): RawVideoSource[] => {
  const relinked = relinkSeriesIds(videos);
  const grouped = new Map<string, RawVideoSource[]>();
  const noSeries: RawVideoSource[] = [];

  for (const video of relinked) {
    if (!video.seriesId) {
      noSeries.push(video);
      continue;
    }

    const list = grouped.get(video.seriesId) ?? [];
    list.push(video);
    grouped.set(video.seriesId, list);
  }

  const merged: RawVideoSource[] = noSeries.filter((video) => {
    const longest = (video.playLines ?? []).reduce(
      (max, line) => Math.max(max, line.episodes.length),
      0,
    );
    return longest <= MAX_EPISODES_PER_VIDEO;
  });

  for (const [, group] of grouped) {
    if (group.length === 1) {
      const single = group[0];
      const singleLongest = (single.playLines ?? []).reduce(
        (max, line) => Math.max(max, line.episodes.length),
        0,
      );

      if (singleLongest > MAX_EPISODES_PER_VIDEO) {
        continue;
      }

      merged.push(single);
      continue;
    }

    const base = group.reduce((best, current) =>
      countEpisodes(current.playLines) > countEpisodes(best.playLines) ? current : best,
    );
    const mergedLines = cloneLines(base.playLines);

    for (const member of group) {
      if (!member.playLines) {
        continue;
      }

      for (const memberLine of member.playLines) {
        const targetLine = mergedLines.find((line) => line.line === memberLine.line);

        if (!targetLine) {
          mergedLines.push({
            episodes: memberLine.episodes.map(cloneEpisode),
            label: memberLine.label,
            line: memberLine.line,
          });
          continue;
        }

        for (const memberEpisode of memberLine.episodes) {
          const targetEpisode = targetLine.episodes.find(
            (episode) => episode.episode === memberEpisode.episode,
          );

          if (!targetEpisode) {
            targetLine.episodes.push(cloneEpisode(memberEpisode));
            targetLine.episodes.sort((left, right) => left.episode - right.episode);
            continue;
          }

          if (!targetEpisode.mediaUrl && memberEpisode.mediaUrl) {
            targetEpisode.mediaUrl = memberEpisode.mediaUrl;
            targetEpisode.format = memberEpisode.format;
            targetEpisode.sourceType = memberEpisode.sourceType;
          }
        }
      }
    }

    mergedLines.sort((left, right) => left.line - right.line);

    const longestLineEpisodes = mergedLines.reduce(
      (max, line) => Math.max(max, line.episodes.length),
      0,
    );

    if (longestLineEpisodes > MAX_EPISODES_PER_VIDEO) {
      // Drop overly long series early so they never appear as cards.
      continue;
    }

    const firstPlayable = mergedLines
      .flatMap((line) => line.episodes)
      .find((episode) => Boolean(episode.mediaUrl));
    const resolvedFormat = firstPlayable?.format ?? base.format;

    merged.push({
      ...base,
      format: resolvedFormat,
      playLines: mergedLines,
      source: firstPlayable?.mediaUrl ?? base.source,
      sourceType: firstPlayable
        ? getSourceType(resolvedFormat ?? 'unknown')
        : (base.sourceType ?? 'unsupported'),
    });
  }

  return merged;
};

const applySourceRuntimeOverrides = (
  source: AuthorizedWebPageSourceConfig,
  overrides?: WebCrawlerSourceRuntimeOverrides,
): AuthorizedWebPageSourceConfig => {
  if (!overrides) {
    return source;
  }

  return {
    ...source,
    crawlDepth: overrides.crawlDepth ?? source.crawlDepth,
    crawlIntervalMs: overrides.crawlIntervalMs ?? source.crawlIntervalMs,
    frontierSeedLimit: overrides.frontierSeedLimit ?? source.frontierSeedLimit,
    discoverNavigationAfterEnoughVideos:
      overrides.discoverNavigationAfterEnoughVideos ?? source.discoverNavigationAfterEnoughVideos,
    maxChildrenPerPage: overrides.maxChildrenPerPage ?? source.maxChildrenPerPage,
    maxConcurrency: overrides.maxConcurrency ?? source.maxConcurrency,
    maxDetailPages: overrides.maxDetailPages ?? source.maxDetailPages,
    maxNavigationPageNumber: overrides.maxNavigationPageNumber ?? source.maxNavigationPageNumber,
    maxNavigationPages: overrides.maxNavigationPages ?? source.maxNavigationPages,
    maxVideos: overrides.maxVideos ?? source.maxVideos,
    seedPathPrefixes: overrides.seedPathPrefixes ?? source.seedPathPrefixes,
    timeoutMs: overrides.timeoutMs ?? source.timeoutMs,
  };
};

const normalizeSeedPathForMatch = (value: string, baseUrl?: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed, baseUrl).pathname.toLowerCase();
  } catch {
    const pathOnly = trimmed.split(/[?#]/)[0]?.toLowerCase() ?? '';
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  }
};

const getSeedPathPrefixFilters = (source: AuthorizedWebPageSourceConfig) =>
  (source.seedPathPrefixes ?? [])
    .map((prefix) => normalizeSeedPathForMatch(prefix, source.url))
    .filter((prefix): prefix is string => Boolean(prefix));

const matchesSeedPathPrefixes = (value: string, prefixes: string[], baseUrl?: string) => {
  if (prefixes.length === 0) {
    return true;
  }

  const path = normalizeSeedPathForMatch(value, baseUrl);

  return prefixes.some((prefix) => (prefix === '/' ? path === '/' : path.startsWith(prefix)));
};

const buildSeedAllowedUrls = (source: AuthorizedWebPageSourceConfig) => {
  const seedPathPrefixes = getSeedPathPrefixFilters(source);
  const seedPaths = (source.seedPaths ?? []).filter((seed) =>
    matchesSeedPathPrefixes(seed.path, seedPathPrefixes, source.url),
  );

  if (seedPaths.length === 0) {
    return {
      allowedUrls:
        seedPathPrefixes.length > 0 && !seedPathPrefixes.includes('/') ? [] : [source.url],
      priorityMap: new Map<string, number>(),
      seedPathPrefixes,
    };
  }

  const priorityMap = new Map<string, number>();
  const allowedUrls: string[] = [];

  for (const seed of seedPaths) {
    try {
      const resolved = new URL(seed.path, source.url).toString();

      if (!priorityMap.has(resolved)) {
        priorityMap.set(resolved, seed.priority ?? 0);
        allowedUrls.push(resolved);
      }
    } catch {
      // Skip malformed seed paths silently.
    }
  }

  const shouldIncludeBaseUrl = seedPathPrefixes.length === 0 || seedPathPrefixes.includes('/');
  const baseKey = new URL(source.url).toString();
  if (shouldIncludeBaseUrl && !priorityMap.has(baseKey)) {
    priorityMap.set(baseKey, 0);
    allowedUrls.push(baseKey);
  }

  return { allowedUrls, priorityMap, seedPathPrefixes };
};

const getVideoDedupeKey = (video: RawVideoSource) => {
  const providerKey =
    video.provider?.trim().toLowerCase() ??
    getHostname(video.webViewUrl ?? video.source).toLowerCase();

  if (video.seriesId) {
    return `${providerKey}|${video.seriesId.trim().toLowerCase()}`;
  }

  return `${providerKey}|${video.source.trim().toLowerCase()}`;
};

export const crawlConfiguredAuthorizedWebPages = async (
  sources: AuthorizedWebPageSourceConfig[] = AUTHORIZED_WEB_PAGE_SOURCES,
  options: CrawlConfiguredAuthorizedWebPagesOptions = {},
): Promise<WebCrawlerResult> => {
  const videos: RawVideoSource[] = [];
  const errors: WebCrawlerError[] = [];
  const discoveredPages: CrawlerDiscoveredPage[] = [];
  const maxTotalVideos = Math.max(1, options.maxTotalVideos ?? Number.POSITIVE_INFINITY);

  const emitAggregatedProgress = (currentSourcePartial: RawVideoSource[]) => {
    if (!options.onProgress) {
      return;
    }

    try {
      const aggregated = aggregateBySeriesId([...videos, ...currentSourcePartial]);
      options.onProgress(aggregated);
    } catch (error) {
      crawlerWarn(
        '[crawler] aggregated onProgress threw',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  for (const sourceConfig of sources) {
    if (options.signal?.aborted) {
      break;
    }

    const source = applySourceRuntimeOverrides(sourceConfig, options.sourceOverrides);

    if (source.enabled === false) {
      continue;
    }

    if (getCrawlVideoCardCount(videos) >= maxTotalVideos) {
      break;
    }

    const { allowedUrls, priorityMap, seedPathPrefixes } = buildSeedAllowedUrls(source);
    const frontierPages = await selectCrawlerFrontierPages(
      source.url,
      source.frontierSeedLimit ?? 0,
    );

    for (const page of frontierPages) {
      if (!matchesSeedPathPrefixes(page.url, seedPathPrefixes, source.url)) {
        continue;
      }

      if (priorityMap.has(page.url)) {
        continue;
      }

      priorityMap.set(page.url, page.priority);
      allowedUrls.push(page.url);
    }

    const result = await crawlAuthorizedWebPages({
      allowedUrls,
      crawlDepth: source.crawlDepth,
      crawlIntervalMs: source.crawlIntervalMs,
      discoverNavigationAfterEnoughVideos: source.discoverNavigationAfterEnoughVideos,
      initialUrlPriority: priorityMap,
      maxChildrenPerPage: source.maxChildrenPerPage,
      maxConcurrency: source.maxConcurrency,
      maxDetailPages: source.maxDetailPages,
      maxNavigationPageNumber: source.maxNavigationPageNumber,
      maxNavigationPages: source.maxNavigationPages,
      maxVideos: source.maxVideos,
      onProgress: options.onProgress ? emitAggregatedProgress : undefined,
      page: source.page,
      priorityPathPatterns: source.priorityPathPatterns,
      provider: source.provider,
      signal: options.signal,
      sourceUrl: source.url,
      timeoutMs: source.timeoutMs,
    });

    videos.push(...result.videos);
    errors.push(...result.errors);
    discoveredPages.push(...result.discoveredPages);
    void rememberCrawlerDiscoveredPages(result.discoveredPages);

    crawlerLog(
      '[crawler] source done',
      source.url,
      'videos=',
      result.videos.length,
      'errors=',
      result.errors.length,
      result.errors.length > 0
        ? result.errors.slice(0, 3).map((error) => `${error.reason ?? 'unknown'}:${error.message}`)
        : '',
    );

    if (result.videos.length === 0 && result.errors.length > 0) {
      const fallbackVideo = buildConfiguredPageFallbackVideo(source);

      if (fallbackVideo) {
        videos.push(fallbackVideo);
      }
    }

    if (getCrawlVideoCardCount(videos) >= maxTotalVideos) {
      break;
    }
  }

  const aggregatedVideos = aggregateBySeriesId(videos);
  const dedupedVideos = dedupeValues(aggregatedVideos, getVideoDedupeKey);
  const dedupedErrors = dedupeValues(
    errors,
    (error) => `${error.reason ?? 'unknown'}|${error.url}|${error.message}`,
  );

  crawlerLog(
    '[crawler] all done',
    'videos=',
    dedupedVideos.length,
    'episodesTotal=',
    dedupedVideos.reduce((sum, video) => sum + countEpisodes(video.playLines), 0),
    'errors=',
    dedupedErrors.length,
  );

  return {
    discoveredPages,
    errors: dedupedErrors,
    videos: dedupedVideos,
  };
};

export const loadAuthorizedWebPageRawSources = async (
  sources?: AuthorizedWebPageSourceConfig[],
  options?: Pick<WebCrawlerOptions, 'maxTotalVideos' | 'signal'>,
): Promise<RawVideoSource[]> => {
  const result = await crawlConfiguredAuthorizedWebPages(sources, options);

  return result.videos;
};

export const loadDiscoveredWebPages = loadCrawlerDiscoveredPages;
export const clearDiscoveredWebPages = clearCrawlerDiscoveredPages;

export type FetchEpisodeMediaResult = {
  format?: VideoFormat;
  mediaUrl?: string;
  sourceType?: VideoSourceType;
};

export const fetchEpisodeMediaUrl = async (
  playPageUrl: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<FetchEpisodeMediaResult> => {
  try {
    const html = await fetchHtml(playPageUrl, {
      allowedUrls: [playPageUrl],
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 20_000,
    });
    const page = extractPage(html, playPageUrl);
    const mediaUrl = page.mediaUrls[0];

    if (!mediaUrl) {
      return {};
    }

    const format = getFormatFromUrl(mediaUrl) ?? undefined;

    return {
      format,
      mediaUrl,
      sourceType: format ? getSourceType(format) : undefined,
    };
  } catch (error) {
    crawlerWarn(
      '[crawler] fetchEpisodeMediaUrl failed',
      playPageUrl,
      error instanceof Error ? error.message : String(error),
    );

    return {};
  }
};

export type ProbeMediaResult = {
  reachable: boolean;
  status?: number;
  reason?: string;
  durationMs: number;
};

const MEDIA_PROBE_TIMEOUT_MS = 60_000;
const MEDIA_PROBE_RANGE_HEADER = 'bytes=0-127';

const isPlausibleMediaContentType = (contentType: string | null | undefined, mediaUrl: string) => {
  if (!contentType) {
    // Some hosts don't set content-type on HEAD; don't reject blindly — rely on status.
    return true;
  }

  const normalized = contentType.toLowerCase();
  if (normalized.startsWith('text/html')) {
    return false;
  }

  if (normalized.startsWith('text/plain')) {
    return isDirectMediaUrl(mediaUrl);
  }

  if (
    normalized.includes('mpegurl') ||
    normalized.includes('octet-stream') ||
    normalized.includes('video/') ||
    normalized.includes('audio/') ||
    normalized.includes('application/') ||
    normalized.includes('binary/')
  ) {
    return true;
  }

  return false;
};

const isSuccessfulMediaProbe = (
  mediaUrl: string,
  probe: { status: number; contentType: string | null },
) =>
  probe.status >= 200 &&
  probe.status < 400 &&
  isPlausibleMediaContentType(probe.contentType, mediaUrl);

const shouldRetryMediaProbeWithGet = (
  mediaUrl: string,
  probe: { status: number; contentType: string | null },
) => probe.status === 405 || probe.status === 501 || !isSuccessfulMediaProbe(mediaUrl, probe);

const probeMediaUrlOnce = async (
  url: string,
  method: 'HEAD' | 'GET',
  signal: AbortSignal,
): Promise<{ status: number; contentType: string | null }> => {
  const headers: Record<string, string> = {
    'User-Agent': CRAWLER_USER_AGENT,
    Accept: '*/*',
  };

  if (method === 'GET') {
    headers.Range = MEDIA_PROBE_RANGE_HEADER;
  }

  const response = await fetch(url, {
    method,
    headers,
    signal,
  });

  const contentType = response.headers.get('content-type');

  if (method === 'GET') {
    try {
      const reader = response.body?.getReader?.();
      reader?.cancel().catch(() => undefined);
    } catch {
      // ignore
    }
  }

  return { status: response.status, contentType };
};

export const probeMediaUrlReachable = async (
  mediaUrl: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ProbeMediaResult> => {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? MEDIA_PROBE_TIMEOUT_MS;
  const timeout = createTimeoutSignal(timeoutMs);
  const signal = options?.signal ? mergeSignals([options.signal, timeout.signal]) : timeout.signal;

  const finish = (result: Omit<ProbeMediaResult, 'durationMs'>): ProbeMediaResult => ({
    ...result,
    durationMs: Date.now() - startedAt,
  });

  try {
    let probe: { status: number; contentType: string | null };
    let usedGet = false;

    try {
      probe = await probeMediaUrlOnce(mediaUrl, 'HEAD', signal);
    } catch {
      probe = await probeMediaUrlOnce(mediaUrl, 'GET', signal);
      usedGet = true;
    }

    if (!usedGet && shouldRetryMediaProbeWithGet(mediaUrl, probe)) {
      probe = await probeMediaUrlOnce(mediaUrl, 'GET', signal);
      usedGet = true;
    }

    if (probe.status >= 200 && probe.status < 400) {
      if (!isPlausibleMediaContentType(probe.contentType, mediaUrl)) {
        return finish({
          reachable: false,
          status: probe.status,
          reason: `non-media content-type ${probe.contentType ?? 'unknown'}`,
        });
      }

      return finish({ reachable: true, status: probe.status });
    }

    return finish({
      reachable: false,
      status: probe.status,
      reason: `bad status ${probe.status}`,
    });
  } catch (error) {
    return finish({
      reachable: false,
      reason: error instanceof Error ? error.message : 'probe failed',
    });
  } finally {
    timeout.cleanup();
  }
};
