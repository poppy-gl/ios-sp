import { detectVideoFormat } from '@/services/formatDetector';
import type { VideoCodec, VideoFormat, VideoSourceType } from '@/types/video';

export type ParsedVideoSource = {
  codec: VideoCodec;
  format: VideoFormat;
  mimeType?: string;
  playableInApp: boolean;
  sourceType: VideoSourceType;
  unsupportedReason?: string;
};

const unsupportedText =
  '\u5f53\u524d\u89c6\u9891\u683c\u5f0f\u6682\u4e0d\u652f\u6301 iOS App \u5185\u64ad\u653e';

const directSourceFormats = new Set<VideoFormat>([
  'mp4',
  'm3u8',
  'hls',
  'mov',
  'm4v',
  'mkv',
  'webm',
]);

export const parseVideoSource = (source: string): ParsedVideoSource => {
  const normalizedSource = source.trim();

  if (!normalizedSource) {
    return {
      codec: 'unknown',
      format: 'unknown',
      playableInApp: false,
      sourceType: 'unsupported',
      unsupportedReason: '\u89c6\u9891\u5730\u5740\u4e3a\u7a7a',
    };
  }

  const detected = detectVideoFormat({ uri: normalizedSource });
  const hasDirectMediaFormat = directSourceFormats.has(detected.format);

  return {
    codec: detected.codec,
    format: detected.format,
    mimeType: detected.mimeType,
    playableInApp: hasDirectMediaFormat,
    sourceType: hasDirectMediaFormat
      ? detected.format === 'm3u8'
        ? 'hls'
        : detected.format
      : 'unsupported',
    unsupportedReason: hasDirectMediaFormat
      ? undefined
      : (detected.unsupportedReason ?? unsupportedText),
  };
};
