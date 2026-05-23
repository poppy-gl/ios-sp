import type { RawVideoSource, VideoFormat, VideoItem, VideoSourceType } from '@/types/video';

export type ProviderKind = 'backend' | 'local-crawler' | 'mock';

export type ProviderCapability =
  | 'fetch-videos'
  | 'search-videos'
  | 'get-video-detail'
  | 'resolve-episode'
  | 'local-fallback'
  | 'health-check';

export type ProviderHealth = {
  configured: boolean;
  enabled: boolean;
  lastCheckedAt?: string;
  message?: string;
  status: 'available' | 'disabled' | 'degraded' | 'unavailable';
};

export type ProviderPriority = {
  order: number;
  reason: string;
};

export type ProviderIssue = {
  code?: 'EMPTY_RESULT' | 'CRAWL_FAILED' | 'PARSE_FAILED' | 'POLICY_REJECTED';
  message: string;
  sourceId?: string;
  status?: number;
  url?: string;
};

export type ProviderCrawlerSourceOverrides = {
  crawlDepth?: number;
  crawlIntervalMs?: number;
  discoverNavigationAfterEnoughVideos?: boolean;
  frontierSeedLimit?: number;
  maxChildrenPerPage?: number;
  maxConcurrency?: number;
  maxDetailPages?: number;
  maxNavigationPageNumber?: number;
  maxNavigationPages?: number;
  maxVideos?: number;
  seedPathPrefixes?: string[];
  timeoutMs?: number;
};

export type ProviderFetchVideosOptions = {
  category?: string;
  maxTotalVideos?: number;
  onRawProgress?: (items: RawVideoSource[]) => void;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
  sort?: string;
  sourceOverrides?: ProviderCrawlerSourceOverrides;
  timeoutMs?: number;
};

export type ProviderFetchVideosResult = {
  errors: ProviderIssue[];
  items?: VideoItem[];
  kind: ProviderKind;
  providerId: string;
  rawSources?: RawVideoSource[];
};

export type ProviderEpisodeResolvePayload = {
  episode: number;
  line: number;
  playPageUrl?: string;
  videoId: string;
};

export type ProviderEpisodeResolveResult = {
  format?: VideoFormat;
  mediaUrl: string;
  reachable?: boolean;
  sourceType?: VideoSourceType;
};

export type ProviderRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type VideoProvider = {
  capabilities: ProviderCapability[];
  fetchVideos?: (options?: ProviderFetchVideosOptions) => Promise<ProviderFetchVideosResult>;
  getHealth: () => ProviderHealth;
  getVideoById?: (id: string, options?: ProviderRequestOptions) => Promise<VideoItem | undefined>;
  id: string;
  isConfigured: () => boolean;
  isEnabled: () => boolean;
  kind: ProviderKind;
  label: string;
  priority: ProviderPriority;
  resolveEpisode?: (
    payload: ProviderEpisodeResolvePayload,
    options?: ProviderRequestOptions,
  ) => Promise<ProviderEpisodeResolveResult>;
  searchVideos?: (keyword: string, options?: ProviderRequestOptions) => Promise<VideoItem[]>;
};
