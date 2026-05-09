import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { VideoItem } from '@/types/video';

type FavoritesState = {
  favorites: VideoItem[];
  favoriteIds: string[];
  hasHydrated: boolean;
  isSelectionMode: boolean;
  selectedFavoriteIds: string[];
  setHasHydrated: (value: boolean) => void;
  addFavorite: (video: VideoItem) => void;
  clearFavoriteSelection: () => void;
  removeFavorite: (id: string) => void;
  removeSelectedFavorites: () => void;
  selectAllFavorites: () => void;
  setSelectionMode: (enabled: boolean) => void;
  toggleFavorite: (video: VideoItem) => void;
  toggleFavoriteSelection: (id: string) => void;
  isFavorite: (id: string) => boolean;
  clearFavorites: () => void;
};

const toFavoriteIds = (favorites: VideoItem[]) => favorites.map((video) => video.id);

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      favoriteIds: [],
      hasHydrated: false,
      isSelectionMode: false,
      selectedFavoriteIds: [],
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addFavorite: (video) => {
        set((state) => {
          if (state.favoriteIds.includes(video.id)) {
            return state;
          }

          const favorites = [video, ...state.favorites];

          return {
            favorites,
            favoriteIds: toFavoriteIds(favorites),
          };
        });
      },
      removeFavorite: (id) => {
        set((state) => {
          const favorites = state.favorites.filter((video) => video.id !== id);
          const selectedFavoriteIds = state.selectedFavoriteIds.filter((item) => item !== id);

          return {
            favorites,
            favoriteIds: toFavoriteIds(favorites),
            isSelectionMode: selectedFavoriteIds.length > 0 ? state.isSelectionMode : false,
            selectedFavoriteIds,
          };
        });
      },
      clearFavoriteSelection: () => set({ isSelectionMode: false, selectedFavoriteIds: [] }),
      removeSelectedFavorites: () =>
        set((state) => {
          const selected = new Set(state.selectedFavoriteIds);
          const favorites = state.favorites.filter((video) => !selected.has(video.id));

          return {
            favorites,
            favoriteIds: toFavoriteIds(favorites),
            isSelectionMode: false,
            selectedFavoriteIds: [],
          };
        }),
      selectAllFavorites: () =>
        set((state) => ({
          isSelectionMode: state.favorites.length > 0,
          selectedFavoriteIds: toFavoriteIds(state.favorites),
        })),
      setSelectionMode: (enabled) =>
        set((state) => ({
          isSelectionMode: enabled,
          selectedFavoriteIds: enabled ? state.selectedFavoriteIds : [],
        })),
      toggleFavorite: (video) => {
        if (get().favoriteIds.includes(video.id)) {
          get().removeFavorite(video.id);
          return;
        }

        get().addFavorite(video);
      },
      toggleFavoriteSelection: (id) =>
        set((state) => {
          const isSelected = state.selectedFavoriteIds.includes(id);
          const selectedFavoriteIds = isSelected
            ? state.selectedFavoriteIds.filter((item) => item !== id)
            : [...state.selectedFavoriteIds, id];

          return {
            isSelectionMode: selectedFavoriteIds.length > 0 || state.isSelectionMode,
            selectedFavoriteIds,
          };
        }),
      isFavorite: (id) => get().favoriteIds.includes(id),
      clearFavorites: () =>
        set({
          favorites: [],
          favoriteIds: [],
          isSelectionMode: false,
          selectedFavoriteIds: [],
        }),
    }),
    {
      name: 'ios-video-favorites',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        favorites: state.favorites,
        favoriteIds: state.favoriteIds,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FavoritesState>;
        const favorites = persisted.favorites ?? currentState.favorites;

        return {
          ...currentState,
          ...persisted,
          favorites,
          favoriteIds: toFavoriteIds(favorites),
          isSelectionMode: false,
          selectedFavoriteIds: [],
        };
      },
    },
  ),
);
