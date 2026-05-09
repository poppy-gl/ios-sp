import AsyncStorage from '@react-native-async-storage/async-storage';

export type CrawlerDiscoveredPageKind =
  | 'seed'
  | 'navigation'
  | 'detail'
  | 'playback'
  | 'media'
  | 'other';

export type CrawlerDiscoveredPageStatus = 'pending' | 'visited' | 'backoff' | 'failed';

export type CrawlerDiscoveredPage = {
  depth: number;
  firstSeenAt: number;
  kind: CrawlerDiscoveredPageKind;
  lastSeenAt: number;
  parentUrl?: string;
  priority: number;
  rawCategory?: string;
  sourceUrl?: string;
  status: CrawlerDiscoveredPageStatus;
  title?: string;
  url: string;
};

type PersistedCrawlerDiscovery = {
  pages: CrawlerDiscoveredPage[];
  savedAt: number;
  version: number;
};

const STORAGE_KEY = 'iosVideoApp/crawlerDiscovery.v1';
const STORAGE_VERSION = 1;
const MAX_DISCOVERED_PAGES = 5_000;
const DEFAULT_FRONTIER_LIMIT = 120;
const STATUS_WEIGHT: Record<CrawlerDiscoveredPageStatus, number> = {
  pending: 1,
  failed: 2,
  backoff: 3,
  visited: 4,
};
const KIND_WEIGHT: Record<CrawlerDiscoveredPageKind, number> = {
  detail: 5,
  navigation: 4,
  playback: 3,
  seed: 2,
  media: 1,
  other: 0,
};

let inMemoryPages: CrawlerDiscoveredPage[] | undefined;

const getPageKey = (page: Pick<CrawlerDiscoveredPage, 'url'>) => page.url.trim().toLowerCase();

const normalizeSourceKey = (sourceUrl?: string) => {
  if (!sourceUrl) {
    return undefined;
  }

  try {
    const url = new URL(sourceUrl);
    url.hash = '';
    url.search = '';
    return url.toString().toLowerCase();
  } catch {
    return sourceUrl.trim().toLowerCase();
  }
};

const compareDiscoveredPages = (left: CrawlerDiscoveredPage, right: CrawlerDiscoveredPage) => {
  const statusDelta = STATUS_WEIGHT[left.status] - STATUS_WEIGHT[right.status];

  if (statusDelta !== 0) {
    return statusDelta;
  }

  const priorityDelta = right.priority - left.priority;

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const kindDelta = KIND_WEIGHT[right.kind] - KIND_WEIGHT[left.kind];

  if (kindDelta !== 0) {
    return kindDelta;
  }

  return right.lastSeenAt - left.lastSeenAt;
};

export const mergeCrawlerDiscoveredPageLists = (
  existingPages: CrawlerDiscoveredPage[],
  incomingPages: CrawlerDiscoveredPage[],
  maxPages = MAX_DISCOVERED_PAGES,
): CrawlerDiscoveredPage[] => {
  if (incomingPages.length === 0) {
    return existingPages;
  }

  const byUrl = new Map<string, CrawlerDiscoveredPage>();

  for (const page of [...existingPages, ...incomingPages]) {
    const key = getPageKey(page);

    if (!key) {
      continue;
    }

    const existing = byUrl.get(key);

    if (!existing) {
      byUrl.set(key, page);
      continue;
    }

    const status =
      page.status === 'pending' && existing.status === 'visited'
        ? existing.status
        : page.lastSeenAt >= existing.lastSeenAt
          ? page.status
          : existing.status;

    byUrl.set(key, {
      ...existing,
      ...page,
      depth: Math.min(existing.depth, page.depth),
      firstSeenAt: Math.min(existing.firstSeenAt, page.firstSeenAt),
      kind: KIND_WEIGHT[page.kind] >= KIND_WEIGHT[existing.kind] ? page.kind : existing.kind,
      lastSeenAt: Math.max(existing.lastSeenAt, page.lastSeenAt),
      priority: Math.max(existing.priority, page.priority),
      rawCategory: page.rawCategory ?? existing.rawCategory,
      sourceUrl: page.sourceUrl ?? existing.sourceUrl,
      status,
      title: page.title ?? existing.title,
    });
  }

  return [...byUrl.values()].sort(compareDiscoveredPages).slice(0, maxPages);
};

export const loadCrawlerDiscoveredPages = async (): Promise<CrawlerDiscoveredPage[]> => {
  if (inMemoryPages) {
    return inMemoryPages;
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);

    if (!raw) {
      inMemoryPages = [];
      return inMemoryPages;
    }

    const parsed = JSON.parse(raw) as PersistedCrawlerDiscovery;

    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.pages)) {
      inMemoryPages = [];
      return inMemoryPages;
    }

    inMemoryPages = mergeCrawlerDiscoveredPageLists([], parsed.pages);
    return inMemoryPages;
  } catch (error) {
    console.warn(
      '[crawlerDiscovery] load failed',
      error instanceof Error ? error.message : String(error),
    );
    inMemoryPages = [];
    return inMemoryPages;
  }
};

export const rememberCrawlerDiscoveredPages = async (
  pages: CrawlerDiscoveredPage[],
): Promise<CrawlerDiscoveredPage[]> => {
  if (pages.length === 0) {
    return loadCrawlerDiscoveredPages();
  }

  const existingPages = await loadCrawlerDiscoveredPages();
  const mergedPages = mergeCrawlerDiscoveredPageLists(existingPages, pages);
  inMemoryPages = mergedPages;

  try {
    const payload: PersistedCrawlerDiscovery = {
      pages: mergedPages,
      savedAt: Date.now(),
      version: STORAGE_VERSION,
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn(
      '[crawlerDiscovery] save failed',
      error instanceof Error ? error.message : String(error),
    );
  }

  return mergedPages;
};

export const getCrawlerDiscoveredPagesSnapshot = () => inMemoryPages ?? [];

export const selectCrawlerFrontierPages = async (
  sourceUrl?: string,
  limit = DEFAULT_FRONTIER_LIMIT,
): Promise<CrawlerDiscoveredPage[]> => {
  const pages = await loadCrawlerDiscoveredPages();
  const sourceKey = normalizeSourceKey(sourceUrl);

  return pages
    .filter((page) => {
      if (page.status === 'visited' || page.kind === 'media') {
        return false;
      }

      if (!sourceKey) {
        return true;
      }

      return normalizeSourceKey(page.sourceUrl) === sourceKey;
    })
    .sort((left, right) => {
      const priorityDelta = right.priority - left.priority;

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const kindDelta = KIND_WEIGHT[right.kind] - KIND_WEIGHT[left.kind];

      if (kindDelta !== 0) {
        return kindDelta;
      }

      return left.firstSeenAt - right.firstSeenAt;
    })
    .slice(0, Math.max(0, limit));
};

export const clearCrawlerDiscoveredPages = async (): Promise<void> => {
  inMemoryPages = [];

  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn(
      '[crawlerDiscovery] clear failed',
      error instanceof Error ? error.message : String(error),
    );
  }
};
