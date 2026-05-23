import { backendProvider } from '@/data/providers/backendProvider';
import { localCrawlerProvider } from '@/data/providers/localCrawlerProvider';
import type {
  ProviderCapability,
  ProviderHealth,
  ProviderKind,
  VideoProvider,
} from '@/data/providers/providerTypes';

type ProviderSelectionEntry = {
  configured: boolean;
  enabled: boolean;
  health: ProviderHealth;
  id: string;
  kind: ProviderKind;
  label: string;
  priority: number;
  reason: string;
  selectedAs: 'primary' | 'fallback' | 'skipped';
};

export type ProviderSelection = {
  entries: ProviderSelectionEntry[];
  fallbacks: VideoProvider[];
  primary?: VideoProvider;
  reason: string;
};

const providers: VideoProvider[] = [backendProvider, localCrawlerProvider];

const byPriority = (first: VideoProvider, second: VideoProvider) =>
  second.priority.order - first.priority.order || first.id.localeCompare(second.id);

const buildEntry = (
  provider: VideoProvider,
  selectedAs: ProviderSelectionEntry['selectedAs'],
  reason: string,
): ProviderSelectionEntry => {
  const health = provider.getHealth();

  return {
    configured: health.configured,
    enabled: health.enabled,
    health,
    id: provider.id,
    kind: provider.kind,
    label: provider.label,
    priority: provider.priority.order,
    reason,
    selectedAs,
  };
};

const getSelectableProviders = (capability?: ProviderCapability) =>
  providers
    .filter((provider) => !capability || provider.capabilities.includes(capability))
    .filter((provider) => provider.isConfigured() && provider.isEnabled())
    .sort(byPriority);

export const selectVideoProviders = (): ProviderSelection => {
  const backendConfigured = backendProvider.isConfigured();
  const selectable = getSelectableProviders('fetch-videos');
  const primary = selectable[0];
  const fallbacks = selectable.slice(1);

  const entries = providers.map((provider) => {
    if (provider === primary) {
      return buildEntry(provider, 'primary', provider.priority.reason);
    }

    if (fallbacks.includes(provider)) {
      return buildEntry(provider, 'fallback', provider.priority.reason);
    }

    const health = provider.getHealth();
    const reason =
      provider.kind === 'backend' && !health.configured
        ? 'Backend API is not configured.'
        : provider.kind === 'local-crawler' && backendConfigured
          ? health.enabled
            ? 'Local crawler is held as fallback behind backend.'
            : 'Local crawler is disabled and backend is configured.'
          : health.message || 'Provider is not enabled.';

    return buildEntry(provider, 'skipped', reason);
  });

  const reason = primary
    ? `Selected ${primary.label}; fallbacks: ${fallbacks.map((provider) => provider.label).join(', ') || 'none'}.`
    : backendConfigured
      ? 'No enabled video provider is available even though backend is configured.'
      : 'Backend API is not configured; production builds will not start local crawling unless EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true.';

  return {
    entries,
    fallbacks,
    primary,
    reason,
  };
};

export const selectEpisodeResolveProviders = () =>
  selectVideoProviders()
    .entries.filter((entry) => entry.selectedAs !== 'skipped')
    .map((entry) => providers.find((provider) => provider.id === entry.id))
    .filter((provider): provider is VideoProvider => Boolean(provider?.resolveEpisode));

export const selectSearchProvider = () =>
  getSelectableProviders('search-videos').find((provider) => provider.searchVideos);

export const selectDetailProvider = () =>
  getSelectableProviders('get-video-detail').find((provider) => provider.getVideoById);

export const selectBackgroundCrawlerProvider = () =>
  getSelectableProviders('fetch-videos').find(
    (provider) => provider.kind === 'local-crawler' && provider.fetchVideos,
  );

export const getProviderSelectionLog = (selection: ProviderSelection = selectVideoProviders()) => ({
  providers: selection.entries,
  reason: selection.reason,
});
