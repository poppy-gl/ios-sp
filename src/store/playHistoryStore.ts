import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PlayHistoryItem = {
  videoId: string;
  episode?: number;
  line?: number;
  progress: number;
  recentPosition: number;
  duration: number;
  lastPlayedAt: string;
  updatedAt: string;
};

type PlayHistoryState = {
  history: PlayHistoryItem[];
  updatedAt?: string;
  clearHistory: () => void;
  getHistoryItem: (
    videoId: string,
    selection?: Pick<PlayHistoryItem, 'episode' | 'line'>,
  ) => PlayHistoryItem | undefined;
  recordProgress: (
    item: Pick<PlayHistoryItem, 'duration' | 'progress' | 'videoId'> &
      Pick<PlayHistoryItem, 'episode' | 'line'>,
  ) => void;
  removeHistoryItem: (videoId: string) => void;
};

const normalizeOptionalNumber = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;

const hasEpisodeSelection = (selection?: Pick<PlayHistoryItem, 'episode' | 'line'>) =>
  normalizeOptionalNumber(selection?.line) !== undefined &&
  normalizeOptionalNumber(selection?.episode) !== undefined;

export const getPlayHistoryItemKey = (
  item: Pick<PlayHistoryItem, 'episode' | 'line' | 'videoId'>,
) => {
  const line = normalizeOptionalNumber(item.line);
  const episode = normalizeOptionalNumber(item.episode);

  if (line === undefined || episode === undefined) {
    return item.videoId;
  }

  return `${item.videoId}:${line}:${episode}`;
};

const normalizeProgress = (progress: number, duration: number) => ({
  duration: Math.max(0, Math.floor(duration)),
  progress: Math.max(0, Math.floor(progress)),
});

const sortHistory = (history: PlayHistoryItem[]) =>
  [...history].sort(
    (first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
  );

const normalizeHistoryItem = (item: Partial<PlayHistoryItem> & { videoId: string }) => {
  const normalized = normalizeProgress(
    item.progress ?? item.recentPosition ?? 0,
    item.duration ?? 0,
  );
  const updatedAt = item.updatedAt ?? item.lastPlayedAt ?? new Date().toISOString();

  return {
    videoId: item.videoId,
    episode: normalizeOptionalNumber(item.episode),
    line: normalizeOptionalNumber(item.line),
    ...normalized,
    recentPosition: normalized.progress,
    lastPlayedAt: item.lastPlayedAt ?? updatedAt,
    updatedAt,
  };
};

export const usePlayHistoryStore = create<PlayHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      updatedAt: undefined,
      clearHistory: () => set({ history: [], updatedAt: new Date().toISOString() }),
      getHistoryItem: (videoId, selection) => {
        const history = get().history;

        if (hasEpisodeSelection(selection)) {
          const key = getPlayHistoryItemKey({
            videoId,
            episode: selection?.episode,
            line: selection?.line,
          });
          const exact = history.find((item) => getPlayHistoryItemKey(item) === key);

          if (exact) {
            return exact;
          }
        }

        return history.find(
          (item) =>
            item.videoId === videoId &&
            normalizeOptionalNumber(item.line) === undefined &&
            normalizeOptionalNumber(item.episode) === undefined,
        );
      },
      recordProgress: ({ duration, episode, line, progress, videoId }) => {
        const normalized = normalizeProgress(progress, duration);
        const normalizedLine = normalizeOptionalNumber(line);
        const normalizedEpisode = normalizeOptionalNumber(episode);

        set((state) => {
          const updatedAt = new Date().toISOString();
          const nextItem: PlayHistoryItem = {
            videoId,
            episode: normalizedEpisode,
            line: normalizedLine,
            ...normalized,
            recentPosition: normalized.progress,
            lastPlayedAt: updatedAt,
            updatedAt,
          };
          const nextKey = getPlayHistoryItemKey(nextItem);
          const history = [
            nextItem,
            ...state.history.filter((item) => getPlayHistoryItemKey(item) !== nextKey),
          ];

          return {
            history: sortHistory(history),
            updatedAt,
          };
        });
      },
      removeHistoryItem: (videoId) =>
        set((state) => {
          const updatedAt = new Date().toISOString();

          return {
            history: state.history.filter((item) => item.videoId !== videoId),
            updatedAt,
          };
        }),
    }),
    {
      name: 'ios-video-play-history',
      // Keep persistence behind Zustand storage so it can be swapped to SQLite later.
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      partialize: (state) => ({
        history: state.history,
        updatedAt: state.updatedAt,
      }),
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<PlayHistoryState>;
        const history = (persisted.history ?? []).map(normalizeHistoryItem);

        return {
          ...persisted,
          history,
          updatedAt: persisted.updatedAt ?? history[0]?.updatedAt,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PlayHistoryState>;
        const history = (persisted.history ?? currentState.history).map(normalizeHistoryItem);

        return {
          ...currentState,
          ...persisted,
          history: sortHistory(history),
          updatedAt: persisted.updatedAt ?? currentState.updatedAt,
        };
      },
    },
  ),
);

export const shouldShowContinueWatching = (item: PlayHistoryItem) =>
  item.duration > 0 && item.recentPosition > 0 && item.recentPosition < item.duration - 5000;
