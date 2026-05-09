import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from '@/shims/reanimated';
import { theme } from '@/theme';

type AppButtonVariant = 'primary' | 'soft' | 'ghost';

type AppButtonProps = {
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: AppButtonVariant;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AppButtonComponent({
  accessibilityLabel,
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = 'primary',
}: AppButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(theme.animation.pressScale, {
          duration: theme.animation.pressDuration,
        });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={[
        styles.button,
        isPrimary && styles.primary,
        variant === 'soft' && styles.soft,
        isGhost && styles.ghost,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={
            isPrimary
              ? theme.colors.textInverse
              : disabled
                ? theme.colors.textSoft
                : theme.colors.primaryDark
          }
        />
      ) : null}
      <Text
        style={[
          styles.label,
          isPrimary && styles.primaryLabel,
          !isPrimary && styles.tintLabel,
          disabled && styles.disabledLabel,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export const AppButton = memo(AppButtonComponent);

const styles = StyleSheet.create({
  button: {
    minHeight: theme.touch.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.lg,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    ...theme.shadow.card,
  },
  soft: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ghost: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.primarySubtle,
  },
  disabled: {
    opacity: theme.opacity.disabled,
  },
  label: {
    ...theme.typography.label,
  },
  primaryLabel: {
    color: theme.colors.textInverse,
  },
  tintLabel: {
    color: theme.colors.primaryDark,
  },
  disabledLabel: {
    color: theme.colors.textSoft,
  },
});
