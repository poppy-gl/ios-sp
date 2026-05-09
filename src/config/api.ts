const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const readEnvValue = (key: string): string | undefined => {
  const value = process.env[key]?.trim();

  return value ? value : undefined;
};

export const API_BASE_URL_ENV_KEY = 'API_BASE_URL';
export const PUBLIC_API_BASE_URL_ENV_KEY = 'EXPO_PUBLIC_API_BASE_URL';

export const API_BASE_URL =
  readEnvValue(API_BASE_URL_ENV_KEY) ?? readEnvValue(PUBLIC_API_BASE_URL_ENV_KEY) ?? '';

export const API_TIMEOUT_MS = 10000;

export const API_ENDPOINTS = {
  videos: '/videos',
  videoDetail: (id: string) => `/videos/${encodeURIComponent(id)}`,
  recommendations: '/recommendations',
  categories: '/categories',
} as const;

export const getApiBaseUrl = (): string => {
  if (!API_BASE_URL) {
    throw new Error(
      `Missing API base URL. Configure ${API_BASE_URL_ENV_KEY} in .env before calling the backend API.`,
    );
  }

  return trimTrailingSlash(API_BASE_URL);
};
