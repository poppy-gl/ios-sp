import { StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';
export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  iconButton: {
    width: 40,
    paddingHorizontal: 0,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  clearButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  historyItem: {
    marginBottom: spacing.md,
  },
  cover: {
    width: 116,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.primarySubtle,
  },
  progressTrack: {
    overflow: 'hidden',
    height: 5,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    backgroundColor: colors.primarySubtle,
  },
  progressFill: {
    height: 5,
    backgroundColor: colors.primary,
  },
  progressText: {
    color: colors.textSoft,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  stateTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 21,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
