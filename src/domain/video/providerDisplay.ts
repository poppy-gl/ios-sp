const DEFAULT_PUBLIC_PROVIDER_LABEL = '聚合线路';
const HIDDEN_PROVIDER_PATTERNS = [/完美看看/i, /wanmeikk/i];

export const getPublicProviderLabel = (
  provider?: string | null,
  fallback = DEFAULT_PUBLIC_PROVIDER_LABEL,
) => {
  const normalized = provider?.trim();

  if (!normalized || HIDDEN_PROVIDER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return fallback;
  }

  return normalized;
};
