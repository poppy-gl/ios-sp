import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentType,
  type Ref,
} from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import Constants from 'expo-constants';

export type AVPlaybackStatus =
  | {
      isLoaded: true;
      durationMillis?: number;
      didJustFinish?: boolean;
      isBuffering: boolean;
      isPlaying: boolean;
      positionMillis?: number;
    }
  | {
      isLoaded: false;
      error?: string;
    };

export const ResizeMode = {
  CONTAIN: 'contain',
} as const;

type VideoProps = {
  onError?: (message: string) => void;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  progressUpdateIntervalMillis?: number;
  resizeMode?: (typeof ResizeMode)[keyof typeof ResizeMode];
  shouldPlay?: boolean;
  source: { uri: string };
  style?: StyleProp<ViewStyle>;
  useNativeControls?: boolean;
};

export type VideoHandle = {
  pauseAsync: () => Promise<void>;
  playAsync: () => Promise<void>;
  presentFullscreenPlayer: () => Promise<void>;
  setPositionAsync: (positionMillis: number) => Promise<void>;
  setRateAsync: (rate: number, shouldCorrectPitch?: boolean) => Promise<void>;
};

type ExpoVideoListenerSubscription = { remove?: () => void } | undefined;

type ExpoVideoPlayer = {
  addListener?: (
    event: string,
    listener: (payload: unknown) => void,
  ) => ExpoVideoListenerSubscription;
  currentTime?: number;
  duration?: number;
  pause?: () => void;
  play?: () => void;
  playbackRate?: number;
  playing?: boolean;
  status?: string;
  timeUpdateEventInterval?: number;
};

type ExpoVideoViewProps = {
  player: ExpoVideoPlayer;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover' | 'fill';
  nativeControls?: boolean;
  allowsFullscreen?: boolean;
  ref?: Ref<unknown>;
};

type ExpoVideoModule = {
  useVideoPlayer: (
    source: string | { uri: string } | null,
    setup?: (player: ExpoVideoPlayer) => void,
  ) => ExpoVideoPlayer;
  VideoView: ComponentType<ExpoVideoViewProps>;
};

type ExpoAvModule = {
  Video: ComponentType<Record<string, unknown>>;
};

const isExpoGo = Constants.appOwnership === 'expo';

const loadExpoVideoModule = (): ExpoVideoModule | null => {
  if (isExpoGo) {
    return null;
  }

  try {
    // SDK 55 推荐的原生视频组件，必须通过 dev client / EAS build 才能拿到原生模块。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-video');

    if (mod?.VideoView && typeof mod?.useVideoPlayer === 'function') {
      return mod as ExpoVideoModule;
    }
  } catch {
    // expo-video 未安装或在 Expo Go 下 require 失败：交给次级路径处理。
  }

  return null;
};

const loadExpoAvModule = (): ExpoAvModule | null => {
  if (isExpoGo) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-av');

    if (mod?.Video) {
      return mod as ExpoAvModule;
    }
  } catch {
    // expo-av 未安装或不可用：保留 fallback。
  }

  return null;
};

const expoVideoModule = loadExpoVideoModule();
const expoAvModule = expoVideoModule ? null : loadExpoAvModule();

export type NativeVideoEngine = 'expo-av' | 'expo-video' | 'none';

export const nativeVideoEngine: NativeVideoEngine = expoVideoModule
  ? 'expo-video'
  : expoAvModule
    ? 'expo-av'
    : 'none';

export const getNativeVideoEngine = () => nativeVideoEngine;

export const isNativeVideoAvailable = nativeVideoEngine !== 'none';

const ExpoVideoBridge = forwardRef<VideoHandle, VideoProps>(
  (
    {
      onError,
      onPlaybackStatusUpdate,
      progressUpdateIntervalMillis,
      resizeMode,
      shouldPlay,
      source,
      style,
      useNativeControls,
    },
    ref,
  ) => {
    const moduleRef = expoVideoModule!;
    const { useVideoPlayer, VideoView } = moduleRef;
    const videoViewRef = useRef<unknown>(null);
    const onErrorRef = useRef(onError);
    const onStatusRef = useRef(onPlaybackStatusUpdate);

    useEffect(() => {
      onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
      onStatusRef.current = onPlaybackStatusUpdate;
    }, [onPlaybackStatusUpdate]);

    const player = useVideoPlayer(source.uri, (instance) => {
      try {
        const intervalSeconds = Math.max(progressUpdateIntervalMillis ?? 500, 100) / 1000;
        instance.timeUpdateEventInterval = intervalSeconds;
      } catch {
        // older expo-video 版本可能没有该字段，忽略。
      }

      if (shouldPlay !== false) {
        try {
          instance.play?.();
        } catch {
          // ignore
        }
      }
    });

    const emitStatus = useCallback(
      (overrides?: { didJustFinish?: boolean; isBuffering?: boolean }) => {
        const callback = onStatusRef.current;
        if (!callback) return;

        const rawDuration = typeof player.duration === 'number' ? player.duration : 0;
        const rawPosition = typeof player.currentTime === 'number' ? player.currentTime : 0;
        const isLoading = player.status === 'loading';

        callback({
          isLoaded: true,
          durationMillis: Number.isFinite(rawDuration) ? rawDuration * 1000 : 0,
          didJustFinish: overrides?.didJustFinish ?? false,
          isBuffering: overrides?.isBuffering ?? isLoading,
          isPlaying: Boolean(player.playing),
          positionMillis: Number.isFinite(rawPosition) ? rawPosition * 1000 : 0,
        });
      },
      [player],
    );

    useImperativeHandle(
      ref,
      () => ({
        pauseAsync: async () => {
          try {
            player.pause?.();
          } catch {
            // ignore
          }
        },
        playAsync: async () => {
          try {
            player.play?.();
          } catch {
            // ignore
          }
        },
        presentFullscreenPlayer: async () => {
          try {
            const view = videoViewRef.current as { enterFullscreen?: () => void } | null;
            view?.enterFullscreen?.();
          } catch {
            // ignore
          }
        },
        setPositionAsync: async (positionMillis: number) => {
          try {
            player.currentTime = Math.max(0, positionMillis) / 1000;
          } catch {
            // ignore
          }
        },
        setRateAsync: async (rate: number) => {
          try {
            player.playbackRate = rate;
          } catch {
            // ignore
          }
        },
      }),
      [player],
    );

    useEffect(() => {
      if (typeof player.addListener !== 'function') {
        return;
      }

      const subStatus = player.addListener('statusChange', (payload) => {
        const event = payload as { status?: string; error?: { message?: string } };

        if (event.status === 'error') {
          const message = event.error?.message ?? 'Playback error';
          onErrorRef.current?.(message);
          onStatusRef.current?.({ isLoaded: false, error: message });
        } else if (event.status === 'readyToPlay') {
          emitStatus({ isBuffering: false });
        } else if (event.status === 'loading') {
          emitStatus({ isBuffering: true });
        }
      });
      const subPlaying = player.addListener('playingChange', () => emitStatus());
      const subTime = player.addListener('timeUpdate', () => emitStatus());
      const subEnd = player.addListener('playToEnd', () =>
        emitStatus({ didJustFinish: true, isBuffering: false }),
      );

      return () => {
        try {
          subStatus?.remove?.();
        } catch {
          /* ignore */
        }
        try {
          subPlaying?.remove?.();
        } catch {
          /* ignore */
        }
        try {
          subTime?.remove?.();
        } catch {
          /* ignore */
        }
        try {
          subEnd?.remove?.();
        } catch {
          /* ignore */
        }
      };
    }, [player, emitStatus]);

    return (
      <VideoView
        ref={videoViewRef}
        player={player}
        style={style}
        contentFit={resizeMode === 'contain' ? 'contain' : 'cover'}
        nativeControls={useNativeControls ?? false}
        allowsFullscreen
      />
    );
  },
);

ExpoVideoBridge.displayName = 'ExpoVideoBridge';

const ExpoAvBridge = forwardRef<VideoHandle, VideoProps>(({ source, style, ...rest }, ref) => {
  const NativeVideo = expoAvModule!.Video;

  return (
    <NativeVideo
      ref={ref as unknown as Ref<unknown>}
      source={source}
      style={style}
      {...(rest as Record<string, unknown>)}
    />
  );
});

ExpoAvBridge.displayName = 'ExpoAvBridge';

const FallbackVideo = forwardRef<VideoHandle, VideoProps>(
  ({ onPlaybackStatusUpdate, source, style }, ref) => {
    useImperativeHandle(ref, () => ({
      pauseAsync: async () => {},
      playAsync: async () => {},
      presentFullscreenPlayer: async () => {},
      setPositionAsync: async () => {},
      setRateAsync: async () => {},
    }));

    useEffect(() => {
      onPlaybackStatusUpdate?.({
        isLoaded: true,
        durationMillis: 0,
        didJustFinish: false,
        isBuffering: false,
        isPlaying: false,
        positionMillis: 0,
      });
    }, [onPlaybackStatusUpdate]);

    return (
      <View style={[styles.container, style]}>
        <Text style={styles.title}>Preview unavailable in Expo Go</Text>
        <Text numberOfLines={2} style={styles.url}>
          {source.uri}
        </Text>
      </View>
    );
  },
);

FallbackVideo.displayName = 'FallbackVideo';

export const Video = forwardRef<VideoHandle, VideoProps>((props, ref) => {
  if (expoVideoModule) {
    return <ExpoVideoBridge ref={ref} {...props} />;
  }

  if (expoAvModule) {
    return <ExpoAvBridge ref={ref} {...props} />;
  }

  return <FallbackVideo ref={ref} {...props} />;
});

Video.displayName = 'Video';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  url: {
    color: '#f9a8d4',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});
