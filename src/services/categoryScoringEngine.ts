export {
  APP_VIDEO_CATEGORIES,
  SUB_CATEGORIES_BY_CATEGORY,
  inferVideoBaseCategory,
  mapCategoryLabelToAppCategory,
  scoreVideoCategory,
} from '@/domain/category/categoryScoringEngine';
export type { CategoryScoreResult, UserVideoSubCategory } from '@/domain/category/categoryTypes';
