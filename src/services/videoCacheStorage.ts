import AsyncStorage from '@react-native-async-storage/async-storage';

import type { VideoItem } from '@/types/video';

const STORAGE_KEY = 'iosVideoApp/videoCache.v3';
export const CACHE_SCHEMA_VERSION = 3;
export const CACHE_SCHEMA_FINGERPRINT = 'v3-stable-id-quality-2026-05';
const STORAGE_MAX_ITEMS = 1_500;
const LEGACY_STORAGE_KEYS = ['iosVideoApp/videoCache.v1', 'iosVideoApp/videoCache.v2'];

type PersistedVideoCache = {
  version: number;
  schemaFingerprint?: string;
  savedAt: number;
  items: VideoItem[];
};

export type PersistedVideoCacheSnapshot = {
  items: VideoItem[];
  savedAt: number;
};

const clearLegacyStorageKeys = async () => {
  await Promise.allSettled(LEGACY_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key)));
};

const parsePersistedCache = (raw: string | null): PersistedVideoCacheSnapshot | undefined => {
  if (!raw) {
    return undefined;
  }

  const parsed = JSON.parse(raw) as Partial<PersistedVideoCache>;

  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    return undefined;
  }

  return {
    items: parsed.items,
    savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
  };
};

const loadLegacyPersistedVideoCache = async (): Promise<
  PersistedVideoCacheSnapshot | undefined
> => {
  for (const key of [...LEGACY_STORAGE_KEYS].reverse()) {
    try {
      const snapshot = parsePersistedCache(await AsyncStorage.getItem(key));

      if (snapshot && snapshot.items.length > 0) {
        console.warn('[videoCacheStorage] using legacy cache as cold-start fallback', key);
        return snapshot;
      }
    } catch {
      // Ignore malformed legacy cache entries.
    }
  }

  return undefined;
};

export const loadPersistedVideoCache = async (): Promise<
  PersistedVideoCacheSnapshot | undefined
> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return loadLegacyPersistedVideoCache();
    }

    const parsed = JSON.parse(raw) as PersistedVideoCache;

    if (
      !parsed ||
      parsed.version !== CACHE_SCHEMA_VERSION ||
      parsed.schemaFingerprint !== CACHE_SCHEMA_FINGERPRINT ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0
    ) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return loadLegacyPersistedVideoCache();
    }

    void clearLegacyStorageKeys();
    return {
      items: parsed.items,
      savedAt: parsed.savedAt,
    };
  } catch (error) {
    console.warn(
      '[videoCacheStorage] load failed',
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
};

export const loadPersistedVideos = async (): Promise<VideoItem[] | undefined> => {
  const snapshot = await loadPersistedVideoCache();

  return snapshot?.items;
};

export const savePersistedVideos = async (items: VideoItem[]): Promise<void> => {
  try {
    if (items.length === 0) {
      return;
    }

    const payload: PersistedVideoCache = {
      version: CACHE_SCHEMA_VERSION,
      schemaFingerprint: CACHE_SCHEMA_FINGERPRINT,
      savedAt: Date.now(),
      items: items.slice(0, STORAGE_MAX_ITEMS),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn(
      '[videoCacheStorage] save failed',
      error instanceof Error ? error.message : String(error),
    );
  }
};

export const clearPersistedVideos = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await clearLegacyStorageKeys();
  } catch (error) {
    console.warn(
      '[videoCacheStorage] clear failed',
      error instanceof Error ? error.message : String(error),
    );
  }
};
