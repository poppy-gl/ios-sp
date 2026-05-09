import type { VideoFormat, VideoItem, VideoSourceType } from '@/types/video';

export type EpisodeMediaPatch = {
  episode: number;
  format?: VideoFormat;
  line: number;
  mediaUrl: string;
  sourceType?: VideoSourceType;
  videoId: string;
};

export type EpisodeMediaPatchResult = {
  changed: boolean;
  items: VideoItem[];
  updatedItems: VideoItem[];
};

const hasEpisodePatchChanged = (
  episode: NonNullable<VideoItem['playLines']>[number]['episodes'][number],
  patch: EpisodeMediaPatch,
) =>
  episode.mediaUrl !== patch.mediaUrl ||
  (patch.format !== undefined && episode.format !== patch.format) ||
  (patch.sourceType !== undefined && episode.sourceType !== patch.sourceType);

export const applyEpisodeMediaPatches = (
  items: VideoItem[],
  patches: EpisodeMediaPatch[],
): EpisodeMediaPatchResult => {
  if (items.length === 0 || patches.length === 0) {
    return { changed: false, items, updatedItems: [] };
  }

  const patchesByVideoId = new Map<string, EpisodeMediaPatch[]>();

  for (const patch of patches) {
    const list = patchesByVideoId.get(patch.videoId) ?? [];
    list.push(patch);
    patchesByVideoId.set(patch.videoId, list);
  }

  let changed = false;
  const updatedItems: VideoItem[] = [];

  const nextItems = items.map((item) => {
    const itemPatches = patchesByVideoId.get(item.id);

    if (!itemPatches || itemPatches.length === 0 || !item.playLines?.length) {
      return item;
    }

    let itemChanged = false;
    const patchByKey = new Map(
      itemPatches.map((patch) => [`${patch.line}:${patch.episode}`, patch] as const),
    );

    const nextLines = item.playLines.map((line) => {
      const nextEpisodes = line.episodes.map((episode) => {
        const patch = patchByKey.get(`${line.line}:${episode.episode}`);

        if (!patch || !hasEpisodePatchChanged(episode, patch)) {
          return episode;
        }

        itemChanged = true;

        return {
          ...episode,
          format: patch.format ?? episode.format,
          mediaUrl: patch.mediaUrl,
          sourceType: patch.sourceType ?? episode.sourceType,
        };
      });

      return nextEpisodes === line.episodes ? line : { ...line, episodes: nextEpisodes };
    });

    if (!itemChanged) {
      return item;
    }

    const firstPlayable = nextLines
      .flatMap((line) => line.episodes)
      .find((episode) => Boolean(episode.mediaUrl));

    const updatedItem: VideoItem = {
      ...item,
      format: firstPlayable?.format ?? item.format,
      playLines: nextLines,
      playableInApp: Boolean(firstPlayable) || item.playableInApp,
      source: firstPlayable?.mediaUrl ?? item.source,
      sourceType: firstPlayable?.sourceType ?? item.sourceType,
      unsupportedReason: firstPlayable ? undefined : item.unsupportedReason,
    };

    changed = true;
    updatedItems.push(updatedItem);

    return updatedItem;
  });

  return {
    changed,
    items: changed ? nextItems : items,
    updatedItems,
  };
};
