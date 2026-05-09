import { useMemo, useRef, type ComponentType } from 'react';
import { View } from 'react-native';

type SharedValue<T> = {
  value: T;
};

type AnimationCallback = (finished?: boolean) => void;

const Animated = {
  View: View as ComponentType<any>,
  createAnimatedComponent<TProps extends object>(Component: ComponentType<TProps>) {
    return Component as ComponentType<any>;
  },
};

export const useSharedValue = <T,>(initialValue: T): SharedValue<T> => {
  const valueRef = useRef<SharedValue<T>>({ value: initialValue });

  return valueRef.current;
};

export const useAnimatedStyle = <TStyle extends object>(factory: () => TStyle): TStyle => {
  return useMemo(factory, [factory]);
};

export const withTiming = <T,>(value: T, _config?: object, callback?: AnimationCallback): T => {
  callback?.(true);
  return value;
};

export const withSpring = <T,>(value: T, _config?: object, callback?: AnimationCallback): T => {
  callback?.(true);
  return value;
};

export const withSequence = <T,>(...values: T[]): T => {
  return values[values.length - 1];
};

export default Animated;
