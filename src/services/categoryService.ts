import {
  APP_VIDEO_CATEGORIES as ENGINE_APP_VIDEO_CATEGORIES,
  inferVideoBaseCategory,
  mapCategoryLabelToAppCategory,
} from '@/services/categoryScoringEngine';
import type { RawVideoSource, VideoCategory } from '@/types/video';

export const APP_VIDEO_CATEGORIES: VideoCategory[] = ENGINE_APP_VIDEO_CATEGORIES;

export const mapCategoryToAppCategory = (category?: string): VideoCategory =>
  mapCategoryLabelToAppCategory(category);

export const inferVideoCategory = (
  raw: Pick<RawVideoSource, 'category' | 'rawCategory' | 'title' | 'description' | 'tags'>,
): VideoCategory => inferVideoBaseCategory(raw);
