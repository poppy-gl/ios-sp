import {
  scoreVideoCategory,
  SUB_CATEGORIES_BY_CATEGORY as ENGINE_SUB_CATEGORIES_BY_CATEGORY,
  type UserVideoSubCategory,
} from '@/services/categoryScoringEngine';
import type { VideoCategory, VideoItem } from '@/types/video';

export { type UserVideoSubCategory } from '@/services/categoryScoringEngine';

export const SUB_CATEGORIES_BY_CATEGORY: Record<VideoCategory, UserVideoSubCategory[]> =
  ENGINE_SUB_CATEGORIES_BY_CATEGORY;

export type CategoryMappedVideoItem = VideoItem & {
  category: VideoCategory;
  subCategory: UserVideoSubCategory;
  categoryMappingConfidence: number;
  categoryMappingReason: string;
};

export const explainVideoCategoryMapping = (video: VideoItem) => {
  const result = scoreVideoCategory({
    category: video.category,
    rawCategory: video.rawCategory,
    title: video.title,
    description: video.description,
    tags: video.tags,
    source: video.source,
    cover: video.cover,
    thumbnailUrl: video.thumbnailUrl,
  });

  return {
    baseCategory: result.category,
    subCategory: result.subCategory,
    confidence: result.confidence,
    reason: result.reason,
  };
};

export const mapVideoItemToAppCategory = (video: VideoItem): CategoryMappedVideoItem => {
  const mapping = explainVideoCategoryMapping(video);

  return {
    ...video,
    category: mapping.baseCategory,
    subCategory: mapping.subCategory,
    categoryMappingConfidence: mapping.confidence,
    categoryMappingReason: mapping.reason,
    rawCategory:
      video.rawCategory ??
      (video.category === mapping.baseCategory ? undefined : String(video.category)),
    playableInApp: video.playableInApp,
    unsupportedReason: video.unsupportedReason,
  };
};

export const mapVideoItemsToAppCategories = (videos: VideoItem[]): CategoryMappedVideoItem[] =>
  videos.map(mapVideoItemToAppCategory);
