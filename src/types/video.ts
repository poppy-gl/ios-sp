export type VideoFormat =
  | 'mp4'
  | 'm3u8'
  | 'hls'
  | 'dash'
  | 'mov'
  | 'm4v'
  | 'mkv'
  | 'webm'
  | 'avi'
  | 'flv'
  | 'ts'
  | 'mpeg'
  | 'mpg'
  | '3gp'
  | 'rmvb'
  | 'mp3'
  | 'aac'
  | 'wav'
  | 'm4a'
  | 'unknown';

export type VideoCodec = 'h264' | 'h265' | 'hevc' | 'vp8' | 'vp9' | 'av1' | 'aac' | 'unknown';

export type VideoSourceType = VideoFormat | 'webview' | 'unsupported';

export type VideoPlayback =
  | {
      type: 'direct';
      uri: string;
      format?: VideoFormat;
    }
  | {
      type: 'unplayable';
      reason: string;
    };

export type VideoPlaybackOption = {
  codec?: VideoCodec;
  format?: VideoFormat;
  label?: string;
  mimeType?: string;
  playableInApp?: boolean;
  sourceType?: VideoSourceType;
  unsupportedReason?: string;
  uri: string;
};

export type VideoPlayEpisode = {
  episode: number;
  episodeLabel?: string;
  format?: VideoFormat;
  mediaUrl?: string;
  playPageUrl: string;
  sourceType?: VideoSourceType;
};

export type VideoPlayLine = {
  episodes: VideoPlayEpisode[];
  label: string;
  line: number;
};

export type VideoCategory =
  | '\u63a8\u8350'
  | '\u7535\u5f71'
  | '\u7535\u89c6\u5267'
  | '\u7efc\u827a'
  | '\u52a8\u6f2b'
  | '\u7eaa\u5f55\u7247'
  | '\u5176\u4ed6';

export type VideoItem = {
  id: string;
  title: string;
  description?: string;
  cover?: string;
  source: string;
  sourceType: VideoSourceType;
  category: VideoCategory | string;
  subCategory?: string;
  categoryMappingConfidence?: number;
  categoryMappingReason?: string;
  rawCategory?: string;
  author?: string;
  provider?: string;
  playCount?: number;
  danmakuCount?: number;
  drm?: boolean;
  isDrm?: boolean;
  duration?: string;
  createdAt?: string;
  tags?: string[];
  format?: VideoFormat;
  codec?: VideoCodec;
  ingestionSource?: 'crawler-pipeline';
  mimeType?: string;
  playableInApp: boolean;
  unsupportedReason?: string;
  thumbnailUrl?: string;
  webViewUrl?: string;
  playback?: VideoPlayback;
  playbackOptions?: VideoPlaybackOption[];
  playLines?: VideoPlayLine[];
  seriesId?: string;
};

export type RawVideoSource = {
  id: string;
  title: string;
  source: string;
  sources?: VideoPlaybackOption[];
  playbackOptions?: VideoPlaybackOption[];
  description?: string;
  cover?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  webViewUrl?: string;
  sourceType?: VideoSourceType;
  format?: VideoFormat;
  codec?: VideoCodec;
  drm?: boolean;
  isDrm?: boolean;
  mimeType?: string;
  category?: string;
  rawCategory?: string;
  author?: string;
  provider?: string;
  playCount?: number;
  danmakuCount?: number;
  duration?: string;
  createdAt?: string;
  tags?: string[];
  playLines?: VideoPlayLine[];
  seriesId?: string;
};
