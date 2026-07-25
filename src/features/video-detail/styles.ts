import { StyleSheet } from 'react-native';
import { colors, fontSize, radius, shadow, spacing } from '@/theme';
export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  linesBlock: {
    marginTop: spacing.xxl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  lineTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  lineTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  lineTabActive: {
    backgroundColor: colors.primary,
  },
  lineTabText: {
    color: colors.primaryDark,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  lineTabTextActive: {
    color: colors.white,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  episodeCell: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCellLazy: {
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  episodeCellText: {
    color: colors.primaryDark,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  noEpisodes: {
    color: colors.textMuted,
    marginTop: spacing.lg,
    fontSize: fontSize.md,
  },
  previewShell: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
  },
  thumbnail: {
    height: '100%',
    width: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  content: {
    padding: spacing.xl,
  },
  favoriteButton: {
    alignSelf: 'flex-start',
    minHeight: spacing.xl + spacing.xxl,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  favoriteButtonActive: {
    backgroundColor: colors.primary,
  },
  favoriteButtonText: {
    color: colors.primaryDark,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  favoriteButtonTextActive: {
    color: colors.white,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
  },
  description: {
    color: colors.text,
    fontSize: fontSize.lg,
    lineHeight: 24,
    marginTop: spacing.lg,
  },
  playButton: {
    minHeight: spacing.xxl * 2,
    marginTop: spacing.xxl,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  playButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
