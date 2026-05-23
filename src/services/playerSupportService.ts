import { detectVideoFormat, type FormatDetectionInput } from '@/services/formatDetector';
import { getNativeVideoEngine } from '@/infra/player/playerEngineSelector';
import type { VideoCodec, VideoFormat, VideoItem } from '@/types/video';

export type PlayerEngine = 'expo-video' | 'expo-av';
export type SupportLevel = 'native' | 'partial' | 'unsupported';
export type UnsupportedReasonCode =
  | 'drm'
  | 'forced-unplayable'
  | 'format'
  | 'codec'
  | 'mime'
  | 'audio-codec'
  | 'unknown-codec'
  | 'unknown';

export type PlayerSupportDecision = {
  canPlayInApp: boolean;
  codec: VideoCodec;
  engine: PlayerEngine;
  format: VideoFormat;
  mimeType?: string;
  needsFallback: boolean;
  playableInApp: boolean;
  supportLevel: SupportLevel;
  unsupportedReasonCode?: UnsupportedReasonCode;
  unsupportedReason?: string;
};

export type TranscodeRequest = {
  sourceUri: string;
  targetCodec: 'h264';
  targetFormat: 'mp4' | 'hls';
};

export type RemoteMediaProbeRequest = {
  mimeType?: string;
  sourceUri: string;
};

const getCurrentEngine = (): PlayerEngine =>
  getNativeVideoEngine() === 'expo-video' ? 'expo-video' : 'expo-av';
const unsupportedReasonText: Record<UnsupportedReasonCode, string> = {
  drm: '\u8be5\u89c6\u9891\u6807\u8bb0\u4e3a DRM \u5185\u5bb9\uff0cApp \u5185\u64ad\u653e\u5df2\u4fdd\u5b88\u7981\u7528',
  'forced-unplayable':
    '\u8be5\u89c6\u9891\u5df2\u88ab\u4e0a\u6e38\u6807\u8bb0\u4e3a\u4e0d\u53ef\u5728 App \u5185\u64ad\u653e',
  format: '\u5f53\u524d\u5bb9\u5668\u683c\u5f0f\u6682\u4e0d\u652f\u6301 App \u5185\u64ad\u653e',
  codec: '\u5f53\u524d\u89c6\u9891\u7f16\u7801\u6682\u4e0d\u652f\u6301 App \u5185\u64ad\u653e',
  mime: '\u5f53\u524d MIME \u7c7b\u578b\u65e0\u6cd5\u786e\u8ba4\u4e3a\u53ef\u64ad\u89c6\u9891',
  'audio-codec':
    '\u5f53\u524d\u97f3\u9891\u7f16\u7801\u6682\u4e0d\u652f\u6301 App \u5185\u64ad\u653e',
  'unknown-codec':
    '\u65e0\u6cd5\u8bc6\u522b\u89c6\u9891\u7f16\u7801\uff0c\u5df2\u4fdd\u5b88\u6807\u8bb0\u4e3a\u4e0d\u53ef\u64ad',
  unknown:
    '\u65e0\u6cd5\u8bc6\u522b\u89c6\u9891\u683c\u5f0f\u6216\u7f16\u7801\uff0c\u5df2\u4fdd\u5b88\u6807\u8bb0\u4e3a\u4e0d\u53ef\u64ad',
};

const BEST_SUPPORTED_FORMATS = new Set<VideoFormat>(['mp4', 'm3u8', 'hls', 'mov', 'm4v']);
const PARTIAL_SUPPORTED_FORMATS = new Set<VideoFormat>(['mkv', 'webm']);
const AUDIO_ONLY_FORMATS = new Set<VideoFormat>(['mp3', 'aac', 'wav', 'm4a']);
const BLOCKED_FORMATS = new Set<VideoFormat>([
  'rmvb',
  'dash',
  'avi',
  'flv',
  'ts',
  'mpeg',
  'mpg',
  '3gp',
  'unknown',
]);
const IOS_NATIVE_VIDEO_CODECS = new Set<VideoCodec>(['h264', 'h265', 'hevc']);
const IOS_NATIVE_AUDIO_CODECS = new Set<VideoCodec>(['aac']);
const PARTIAL_CONTAINER_CODECS = new Set<VideoCodec>(['h264', 'h265', 'hevc', 'vp8', 'vp9']);

const unsupported = (
  detected: ReturnType<typeof detectVideoFormat>,
  reasonCode: UnsupportedReasonCode,
  reason = unsupportedReasonText[reasonCode],
): PlayerSupportDecision => ({
  canPlayInApp: false,
  codec: detected.codec,
  engine: getCurrentEngine(),
  format: detected.format,
  mimeType: detected.mimeType,
  needsFallback: true,
  playableInApp: false,
  supportLevel: 'unsupported',
  unsupportedReasonCode: reasonCode,
  unsupportedReason: reason,
});

const supported = (
  detected: ReturnType<typeof detectVideoFormat>,
  supportLevel: Exclude<SupportLevel, 'unsupported'>,
  needsFallback: boolean,
): PlayerSupportDecision => ({
  canPlayInApp: true,
  codec: detected.codec,
  engine: getCurrentEngine(),
  format: detected.format,
  mimeType: detected.mimeType,
  needsFallback,
  playableInApp: true,
  supportLevel,
});

export const evaluatePlayerSupport = (
  input: FormatDetectionInput | VideoItem,
): PlayerSupportDecision => {
  const isDrm = Boolean(input.isDrm || ('drm' in input && input.drm));
  const detected = detectVideoFormat({
    codec: input.codec,
    format: input.format,
    isDrm,
    mimeType: input.mimeType,
    playableInApp: input.playableInApp,
    sourceType: input.sourceType,
    uri: 'source' in input ? input.source : input.uri,
  });

  if (detected.isDrm) {
    return unsupported(detected, 'drm');
  }

  if (detected.playableInApp === false) {
    return unsupported(detected, 'forced-unplayable');
  }

  if (!detected.mimeType) {
    return unsupported(detected, 'mime');
  }

  if (detected.format === 'unknown') {
    return unsupported(detected, 'unknown');
  }

  if (BLOCKED_FORMATS.has(detected.format)) {
    return unsupported(
      detected,
      'format',
      detected.unsupportedReason ?? unsupportedReasonText.format,
    );
  }

  if (detected.codec === 'unknown' && detected.isStreaming) {
    return supported(detected, 'partial', true);
  }

  if (detected.codec === 'unknown' && BEST_SUPPORTED_FORMATS.has(detected.format)) {
    return supported(detected, 'partial', true);
  }

  if (detected.codec === 'unknown' || detected.codec === 'av1') {
    return unsupported(detected, detected.codec === 'unknown' ? 'unknown-codec' : 'codec');
  }

  if (detected.isAudioOnly || AUDIO_ONLY_FORMATS.has(detected.format)) {
    const canPlayAudio = IOS_NATIVE_AUDIO_CODECS.has(detected.codec);

    return canPlayAudio
      ? supported(detected, 'native', false)
      : unsupported(detected, 'audio-codec');
  }

  if (BEST_SUPPORTED_FORMATS.has(detected.format)) {
    const canPlayNatively = IOS_NATIVE_VIDEO_CODECS.has(detected.codec);

    return canPlayNatively ? supported(detected, 'native', false) : unsupported(detected, 'codec');
  }

  if (PARTIAL_SUPPORTED_FORMATS.has(detected.format)) {
    const canAttemptPartial = PARTIAL_CONTAINER_CODECS.has(detected.codec);

    return canAttemptPartial
      ? supported(detected, 'partial', true)
      : unsupported(detected, 'codec');
  }

  return unsupported(
    detected,
    'format',
    detected.unsupportedReason ?? unsupportedReasonText.format,
  );
};

export const createTranscodeRequest = (sourceUri: string): TranscodeRequest => ({
  sourceUri,
  targetCodec: 'h264',
  targetFormat: 'mp4',
});

export const createRemoteMediaProbeRequest = (
  sourceUri: string,
  mimeType?: string,
): RemoteMediaProbeRequest => ({
  mimeType,
  sourceUri,
});
