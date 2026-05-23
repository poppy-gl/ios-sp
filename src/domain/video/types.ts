import type {
  VideoCategory,
  VideoFormat,
  VideoPlaybackOption,
  VideoSourceType,
} from '@/types/video';

export type PlaybackResolveState = 'unresolved' | 'resolving' | 'resolved' | 'failed' | 'blocked';

export type ProviderCapability =
  | 'search'
  | 'detail'
  | 'episode-list'
  | 'multi-source'
  | 'multi-line'
  | 'direct-media'
  | 'play-page'
  | 'backend-resolve'
  | 'lazy-resolve'
  | 'health-check';

export type Provider = {
  providerId: string;
  name: string;
  baseUrl?: string;
  capabilities: ProviderCapability[];
  enabled?: boolean;
  priority?: number;
};

export type SourceHealth = {
  status: 'unknown' | 'healthy' | 'degraded' | 'failed' | 'blocked';
  score: number;
  lastCheckedAt?: string;
  lastSuccessfulAt?: string;
  consecutiveFailures?: number;
  failureReason?: string;
};

export type EpisodeSource = {
  episode: number;
  label?: string;
  playPageUrl?: string;
  mediaUrl?: string;
  format?: VideoFormat;
  sourceType?: VideoSourceType;
  resolveState: PlaybackResolveState;
  failureReason?: string;
  playbackOptions?: VideoPlaybackOption[];
  resolvedAt?: string;
};

export type PlayLine = {
  line: number;
  label: string;
  providerLineId?: string;
  episodes: EpisodeSource[];
  qualityScore?: number;
  healthScore?: number;
};

export type VideoSource = {
  providerId: string;
  providerVideoId: string;
  title: string;
  sourcePageUrl?: string;
  playLines: PlayLine[];
  qualityScore: number;
  healthScore: number;
  lastResolvedAt?: string;
  health?: SourceHealth;
};

export type VideoPreferenceHints = {
  rankingPolicyId?: string;
  signals: string[];
  keywords?: string[];
  reasons?: string[];
};

export type VideoEntity = {
  canonicalId: string;
  title: string;
  aliases: string[];
  category: VideoCategory | string;
  subCategory?: string;
  area?: string;
  year?: number;
  cover?: string;
  description?: string;
  tags: string[];
  sources: VideoSource[];
  preferenceHints: VideoPreferenceHints;
};
