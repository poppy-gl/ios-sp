import type { VideoCodec, VideoFormat, VideoSourceType } from '@/types/video';

export type FormatDetectionInput = {
  codec?: VideoCodec | string;
  drm?: boolean;
  format?: VideoFormat;
  isDrm?: boolean;
  mimeType?: string;
  playableInApp?: boolean;
  sourceType?: VideoSourceType;
  uri?: string;
};

export type FormatDetectionResult = {
  codec: VideoCodec;
  extension?: string;
  format: VideoFormat;
  isAudioOnly: boolean;
  isDrm: boolean;
  isStreaming: boolean;
  likelySupported: boolean;
  mimeType?: string;
  playableInApp?: boolean;
  unsupportedReason?: string;
};

const unsupportedFormatText =
  '\u5f53\u524d\u683c\u5f0f\u6682\u4e0d\u652f\u6301 App \u5185\u64ad\u653e';

const EXTENSION_FORMATS: Record<string, VideoFormat> = {
  '3gp': '3gp',
  aac: 'aac',
  avi: 'avi',
  flv: 'flv',
  m3u8: 'm3u8',
  m4a: 'm4a',
  m4v: 'm4v',
  mkv: 'mkv',
  mov: 'mov',
  mp3: 'mp3',
  mp4: 'mp4',
  mpeg: 'mpeg',
  mpg: 'mpg',
  mpd: 'dash',
  rmvb: 'rmvb',
  ts: 'ts',
  wav: 'wav',
  webm: 'webm',
};

const MIME_FORMATS: Record<string, VideoFormat> = {
  'application/dash+xml': 'dash',
  'application/mp4': 'mp4',
  'application/vnd.apple.mpegurl': 'hls',
  'application/x-mpegurl': 'hls',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'video/3gpp': '3gp',
  'video/avi': 'avi',
  'video/mp2t': 'ts',
  'video/mp4': 'mp4',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
  'video/vnd.avi': 'avi',
  'video/webm': 'webm',
  'video/x-flv': 'flv',
  'video/x-m4v': 'm4v',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
};

const FORMAT_MIME_TYPES: Partial<Record<VideoFormat, string>> = {
  '3gp': 'video/3gpp',
  aac: 'audio/aac',
  avi: 'video/x-msvideo',
  dash: 'application/dash+xml',
  hls: 'application/vnd.apple.mpegurl',
  m3u8: 'application/vnd.apple.mpegurl',
  m4a: 'audio/mp4',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ts: 'video/mp2t',
  wav: 'audio/wav',
  webm: 'video/webm',
};

const AUDIO_FORMATS = new Set<VideoFormat>(['mp3', 'aac', 'wav', 'm4a']);
const STREAMING_FORMATS = new Set<VideoFormat>(['m3u8', 'hls', 'dash']);
const BLOCKED_FORMATS = new Set<VideoFormat>([
  'unknown',
  'dash',
  'avi',
  'flv',
  'ts',
  'mpeg',
  'mpg',
  '3gp',
  'rmvb',
]);

const normalizeToken = (value?: string) => value?.trim().toLowerCase();

const getExtensionFromUri = (uri?: string) => {
  if (!uri) {
    return undefined;
  }

  const cleanPath = uri.trim().split(/[?#]/)[0] ?? '';
  const match = cleanPath.match(/\.([a-z0-9]+)$/i);

  return match?.[1]?.toLowerCase();
};

const normalizeMimeType = (mimeType?: string) => normalizeToken(mimeType)?.split(';')[0];

const detectFormatFromMimeType = (mimeType?: string): VideoFormat | undefined => {
  const normalizedMime = normalizeMimeType(mimeType);

  if (!normalizedMime) {
    return undefined;
  }

  return MIME_FORMATS[normalizedMime];
};

const detectMimeTypeFromFormat = (format: VideoFormat, mimeType?: string) =>
  normalizeMimeType(mimeType) ?? FORMAT_MIME_TYPES[format];

const detectFormatFromUrlExtension = (uri?: string): VideoFormat | undefined => {
  const extension = getExtensionFromUri(uri);

  return extension ? EXTENSION_FORMATS[extension] : undefined;
};

const detectFormatFromStructuredHints = (
  sourceType?: VideoSourceType,
  format?: VideoFormat,
): VideoFormat | undefined => {
  if (sourceType && sourceType !== 'webview' && sourceType !== 'unsupported') {
    return sourceType;
  }

  return format && format !== 'unknown' ? format : undefined;
};

const detectFormatFromMetadataHints = (input: FormatDetectionInput): VideoFormat | undefined => {
  const normalizedUri = normalizeToken(input.uri);
  const combined = [normalizeToken(input.codec), normalizeToken(input.mimeType)]
    .filter(Boolean)
    .join(' ');

  if (normalizedUri?.includes('format=m3u8') || normalizedUri?.includes('playlist.m3u8')) {
    return 'm3u8';
  }

  if (normalizedUri?.includes('application/vnd.apple.mpegurl')) {
    return 'hls';
  }

  if (normalizedUri?.includes('manifest.mpd') || normalizedUri?.includes('format=mpd')) {
    return 'dash';
  }

  if (normalizedUri?.startsWith('data:')) {
    return detectFormatFromMimeType(normalizedUri.slice(5).split(',')[0]);
  }

  if (!combined) {
    return undefined;
  }

  if (combined.includes('vp8') || combined.includes('vp9') || combined.includes('vp09')) {
    return 'webm';
  }

  if (combined.includes('avc1') || combined.includes('h.264') || combined.includes('h264')) {
    return 'mp4';
  }

  if (combined.includes('hvc1') || combined.includes('hev1') || combined.includes('h.265')) {
    return 'mp4';
  }

  if (combined.includes('mp4a')) {
    return 'mp4';
  }

  return undefined;
};

const normalizeCodec = (codec?: VideoCodec | string, mimeType?: string): VideoCodec => {
  const normalizedCodec = normalizeToken(codec);
  const normalizedMime = normalizeToken(mimeType);
  const combined = [normalizedCodec, normalizedMime].filter(Boolean).join(' ');

  if (!combined) {
    return 'unknown';
  }

  if (combined.includes('avc1') || combined.includes('h.264') || combined.includes('h264')) {
    return 'h264';
  }

  if (combined.includes('hvc1') || combined.includes('hev1') || combined.includes('h.265')) {
    return 'h265';
  }

  if (combined.includes('hevc')) {
    return 'hevc';
  }

  if (combined.includes('vp8')) {
    return 'vp8';
  }

  if (combined.includes('vp9')) {
    return 'vp9';
  }

  if (combined.includes('av01') || combined.includes('av1')) {
    return 'av1';
  }

  if (combined.includes('mp4a') || combined.includes('aac')) {
    return 'aac';
  }

  return 'unknown';
};

export const detectVideoFormat = (input: FormatDetectionInput): FormatDetectionResult => {
  const extension = getExtensionFromUri(input.uri);
  const format =
    detectFormatFromUrlExtension(input.uri) ??
    detectFormatFromMimeType(input.mimeType) ??
    detectFormatFromStructuredHints(input.sourceType, input.format) ??
    detectFormatFromMetadataHints(input) ??
    'unknown';
  const mimeType = detectMimeTypeFromFormat(format, input.mimeType);
  const codec = normalizeCodec(input.codec, input.mimeType ?? mimeType);
  const isStreaming = STREAMING_FORMATS.has(format);
  const isAudioOnly = AUDIO_FORMATS.has(format);
  const isDrm = Boolean(input.isDrm || input.drm);
  const likelySupported = !isDrm && !BLOCKED_FORMATS.has(format);

  return {
    codec,
    extension,
    format,
    isAudioOnly,
    isDrm,
    isStreaming,
    likelySupported,
    mimeType,
    playableInApp: input.playableInApp,
    unsupportedReason: likelySupported ? undefined : unsupportedFormatText,
  };
};
