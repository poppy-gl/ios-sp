import type { VideoItem } from '@/types/video';

export const DOWNLOAD_UNAVAILABLE_MESSAGE = '离线下载功能暂未开放';

export type DownloadUnavailableReason =
  | 'feature-unavailable'
  | 'authorization-required'
  | 'drm-protected'
  | 'unsupported-source';

export type DownloadTaskStatus = 'unavailable' | 'paused' | 'queued';

export type DownloadTask = {
  id: string;
  videoId: string;
  title: string;
  status: DownloadTaskStatus;
  createdAt: string;
  message: string;
};

export type CreateDownloadTaskInput = {
  video: VideoItem;
  authorizationConfirmed?: boolean;
};

export type DownloadTaskResult =
  | {
      ok: true;
      task: DownloadTask;
    }
  | {
      ok: false;
      reason: DownloadUnavailableReason;
      message: string;
    };

const makeUnavailableResult = (
  reason: DownloadUnavailableReason,
  message = DOWNLOAD_UNAVAILABLE_MESSAGE,
): DownloadTaskResult => ({
  ok: false,
  reason,
  message,
});

const isDirectPlayback = (video: VideoItem) =>
  video.playback?.type === 'direct' && video.playableInApp && Boolean(video.playback.uri);

const validateDownloadEligibility = ({
  authorizationConfirmed,
  video,
}: CreateDownloadTaskInput): DownloadTaskResult | null => {
  if (!authorizationConfirmed) {
    return makeUnavailableResult(
      'authorization-required',
      '仅支持用户确认有权使用的视频源预留下下载任务',
    );
  }

  if (video.isDrm || video.drm) {
    return makeUnavailableResult('drm-protected', 'DRM 受保护内容不可下载或绕过');
  }

  if (!isDirectPlayback(video)) {
    return makeUnavailableResult(
      'unsupported-source',
      '仅允许已确认可在 App 内播放的直接视频源进入下载预留流程',
    );
  }

  return null;
};

export const createDownloadTask = (input: CreateDownloadTaskInput): DownloadTaskResult => {
  const eligibilityError = validateDownloadEligibility(input);

  if (eligibilityError) {
    return eligibilityError;
  }

  return makeUnavailableResult('feature-unavailable');
};

export const pauseDownload = (): DownloadTaskResult => makeUnavailableResult('feature-unavailable');

export const resumeDownload = (): DownloadTaskResult =>
  makeUnavailableResult('feature-unavailable');
