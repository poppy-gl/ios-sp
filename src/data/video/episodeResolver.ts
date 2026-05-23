import { selectEpisodeResolveProviders } from '@/data/providers/providerRegistry';
import {
  applyEpisodeMediaPatches,
  type EpisodeMediaPatch,
} from '@/services/videoEpisodePatchService';
import type { RawVideoSource, VideoItem } from '@/types/video';

import { getCurrentCache, setCachedResult } from './videoCache';

export type UpdateEpisodeMediaPayload = EpisodeMediaPatch;

export type ResolveEpisodeMediaPayload = {
  episode: number;
  line: number;
  playPageUrl: string;
  videoId: string;
};

export type ResolvedEpisodeMedia = {
  format?: RawVideoSource['format'];
  mediaUrl: string;
  sourceType?: RawVideoSource['sourceType'];
};

export const updateEpisodeMediaUrls = (payloads: UpdateEpisodeMediaPayload[]): VideoItem[] => {
  const cache = getCurrentCache();

  if (!cache) {
    return [];
  }

  const result = applyEpisodeMediaPatches(cache.items, payloads);

  if (!result.changed) {
    return [];
  }

  setCachedResult(
    {
      errors: cache.errors,
      items: result.items,
      source: cache.source,
      stats: cache.stats,
      status: cache.status,
    },
    { preserveEpisodeProgress: false },
  );

  return result.updatedItems;
};

export const updateEpisodeMediaUrl = (
  payload: UpdateEpisodeMediaPayload,
): VideoItem | undefined => {
  const [updatedItem] = updateEpisodeMediaUrls([payload]);

  return updatedItem;
};

export const resolveEpisodeMediaUrl = async (
  payload: ResolveEpisodeMediaPayload,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ResolvedEpisodeMedia> => {
  const providers = selectEpisodeResolveProviders();
  let lastError: unknown;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];

    try {
      const result = await provider.resolveEpisode?.(payload, options);

      if (!result?.mediaUrl) {
        throw new Error(`${provider.label} resolved media URL is empty.`);
      }

      if (result.reachable === false) {
        throw new Error(`${provider.label} resolved media is not reachable.`);
      }

      return {
        format: result.format,
        mediaUrl: result.mediaUrl,
        sourceType: result.sourceType,
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `[episodeResolver] ${provider.label} episode resolve failed${
          index < providers.length - 1 ? ', trying fallback provider' : ''
        }`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('No episode resolve provider is enabled.');
};
