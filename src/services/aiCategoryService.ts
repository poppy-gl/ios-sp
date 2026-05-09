import { inferVideoCategory, mapCategoryToAppCategory } from '@/services/categoryService';
import type { VideoCategory } from '@/types/video';

export type AiCategoryInput = {
  title: string;
  description?: string;
  tags?: string[];
};

export type AiCategoryProvider = (input: AiCategoryInput) => Promise<string | undefined>;

const AI_CATEGORY_API_KEY_ENV = 'EXPO_PUBLIC_AI_CATEGORY_API_KEY';
const AI_CATEGORY_ENDPOINT_ENV = 'EXPO_PUBLIC_AI_CATEGORY_ENDPOINT';

export const getAiCategoryApiKey = (): string | undefined =>
  process.env[AI_CATEGORY_API_KEY_ENV]?.trim() || undefined;

export const getAiCategoryEndpoint = (): string | undefined =>
  process.env[AI_CATEGORY_ENDPOINT_ENV]?.trim() || undefined;

export const classifyVideoCategoryLocally = (input: AiCategoryInput): VideoCategory =>
  inferVideoCategory({
    title: input.title,
    description: input.description,
    tags: input.tags,
  });

export const createAiCategoryProvider = (): AiCategoryProvider | undefined => {
  const apiKey = getAiCategoryApiKey();
  const endpoint = getAiCategoryEndpoint();

  if (!apiKey || !endpoint) {
    return undefined;
  }

  return async (input) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        description: input.description ?? '',
        tags: input.tags ?? [],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI category request failed: ${response.status}`);
    }

    const result = (await response.json()) as { category?: string };

    return result.category;
  };
};

export const classifyVideoCategory = async (
  input: AiCategoryInput,
  provider = createAiCategoryProvider(),
): Promise<VideoCategory> => {
  if (!provider) {
    return classifyVideoCategoryLocally(input);
  }

  try {
    const aiCategory = await provider(input);

    return aiCategory ? mapCategoryToAppCategory(aiCategory) : classifyVideoCategoryLocally(input);
  } catch {
    return classifyVideoCategoryLocally(input);
  }
};
