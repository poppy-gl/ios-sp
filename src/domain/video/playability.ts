export type PlaybackAvailability = 'direct' | 'lazy' | 'unplayable';

export type PlayabilityInput = {
  playableInApp?: boolean;
  playback?: {
    type?: string;
    uri?: string;
  };
  playbackOptions?: readonly {
    playableInApp?: boolean;
    uri?: string;
  }[];
  playLines?: readonly {
    episodes?: readonly {
      mediaUrl?: string;
      playPageUrl?: string;
    }[];
  }[];
};

const hasText = (value?: string) => Boolean(value?.trim());

export const hasResolvedEpisode = (video: PlayabilityInput) =>
  Boolean(
    video.playLines?.some((line) => line.episodes?.some((episode) => hasText(episode.mediaUrl))),
  );

export const hasLazyResolvableEpisode = (video: PlayabilityInput) =>
  Boolean(
    video.playLines?.some((line) => line.episodes?.some((episode) => hasText(episode.playPageUrl))),
  );

export const isDirectPlayable = (video: PlayabilityInput) =>
  video.playableInApp === true ||
  Boolean(video.playback?.type === 'direct' && hasText(video.playback.uri)) ||
  Boolean(video.playbackOptions?.some((option) => option.playableInApp && hasText(option.uri))) ||
  hasResolvedEpisode(video);

export const getPlaybackAvailability = (video: PlayabilityInput): PlaybackAvailability => {
  if (isDirectPlayable(video)) {
    return 'direct';
  }

  if (hasLazyResolvableEpisode(video)) {
    return 'lazy';
  }

  return 'unplayable';
};

export const isPlayableOrResolvable = (video: PlayabilityInput) =>
  getPlaybackAvailability(video) !== 'unplayable';
