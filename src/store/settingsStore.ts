import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DefaultSort = 'recommended' | 'latest' | 'mostPlayed';

type SettingsState = {
  autoPlay: boolean;
  defaultSort: DefaultSort;
  favoritesClearedAt?: string;
  localCacheClearedAt?: string;
  rememberProgress: boolean;
  searchHistoryClearedAt?: string;
  clearFavorites: () => void;
  clearLocalCache: () => void;
  clearSearchHistory: () => void;
  setAutoPlay: (enabled: boolean) => void;
  setDefaultSort: (sort: DefaultSort) => void;
  setRememberProgress: (enabled: boolean) => void;
};

const nowIso = () => new Date().toISOString();
const defaultSort = 'recommended' as DefaultSort;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoPlay: false,
      defaultSort,
      rememberProgress: true,
      clearFavorites: () => set({ favoritesClearedAt: nowIso() }),
      clearLocalCache: () => set({ localCacheClearedAt: nowIso() }),
      clearSearchHistory: () => set({ searchHistoryClearedAt: nowIso() }),
      setAutoPlay: (enabled) => set({ autoPlay: enabled }),
      setDefaultSort: (sort) => set({ defaultSort: sort }),
      setRememberProgress: (enabled) => set({ rememberProgress: enabled }),
    }),
    {
      name: 'ios-video-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      partialize: (state) => ({
        autoPlay: state.autoPlay,
        defaultSort: state.defaultSort,
        favoritesClearedAt: state.favoritesClearedAt,
        localCacheClearedAt: state.localCacheClearedAt,
        rememberProgress: state.rememberProgress,
        searchHistoryClearedAt: state.searchHistoryClearedAt,
      }),
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<SettingsState>;

        return {
          autoPlay: state.autoPlay ?? false,
          defaultSort: state.defaultSort ?? defaultSort,
          favoritesClearedAt: state.favoritesClearedAt,
          localCacheClearedAt: state.localCacheClearedAt,
          rememberProgress: state.rememberProgress ?? true,
          searchHistoryClearedAt: state.searchHistoryClearedAt,
        };
      },
    },
  ),
);
