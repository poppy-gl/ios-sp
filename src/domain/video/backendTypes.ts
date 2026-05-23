import type {
  VideoCategory,
  VideoCodec,
  VideoFormat,
  VideoPlayback,
  VideoPlaybackOption,
  VideoSourceType,
} from '@/types/video';

export type BackendEpisodeDTO = {
  episode: number | string;
  episodeLabel?: string;
  label?: string;
  failureReason?: string;
  format?: VideoFormat | string;
  mediaUrl?: string;
  playPageUrl?: string;
  sourceType?: VideoSourceType | string;
};

export type BackendPlayLineDTO = {
  episodes?: BackendEpisodeDTO[];
  label?: string;
  line: number | string;
};

export type BackendVideoDTO = {
  id: string;
  title: string;
  author?: string;
  category?: VideoCategory | string;
  codec?: VideoCodec | string;
  cover?: string;
  createdAt?: string;
  danmakuCount?: number;
  description?: string;
  drm?: boolean;
  duration?: string;
  format?: VideoFormat | string;
  isDrm?: boolean;
  mimeType?: string;
  playCount?: number;
  playLines?: BackendPlayLineDTO[];
  playback?: VideoPlayback;
  playbackOptions?: VideoPlaybackOption[];
  playPageUrl?: string;
  provider?: string;
  rawCategory?: string;
  seriesId?: string;
  source?: string;
  sourceType?: VideoSourceType | string;
  subCategory?: string;
  tags?: string[];
  thumbnailUrl?: string;
  unsupportedReason?: string;
  webViewUrl?: string;
};

export type BackendResolveResponse = {
  failureReason?: string;
  format?: VideoFormat | string;
  mediaUrl?: string;
  reachable?: boolean;
  sourceType?: VideoSourceType | string;
};
