import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from '@/shims/reanimated';
import { theme } from '@/theme';

type ListItemProps = {
  accessibilityLabel?: string;
  badge?: string;
  children?: ReactNode;
  disabled?: boolean;
  leading?: ReactNode;
  meta?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  title: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ListItemComponent({
  accessibilityLabel,
  badge,
  children,
  disabled = false,
  leading,
  meta,
  onPress,
  style,
  title,
}: ListItemProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole={onPress ? 'button' : 'summary'}
      disabled={disabled || !onPress}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(theme.animation.listPressScale, {
          duration: theme.animation.pressDuration,
        });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={[styles.item, disabled && styles.disabled, animatedStyle, style]}
    >
      {leading}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.title}>
            {title}
          </Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        {meta ? (
          <Text numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}
        {children}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} /> : null}
    </AnimatedPressable>
  );
}

export const ListItem = memo(ListItemComponent);

const styles = StyleSheet.create({
  item: {
    minHeight: theme.touch.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  disabled: {
    opacity: theme.opacity.disabled,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    ...theme.typography.title,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    color: theme.colors.textInverse,
    fontSize: theme.fontSize.xs,
    fontWeight: '900',
    backgroundColor: theme.colors.primary,
  },
  meta: {
    color: theme.colors.textMuted,
    ...theme.typography.meta,
    marginTop: theme.spacing.xs,
  },
});
