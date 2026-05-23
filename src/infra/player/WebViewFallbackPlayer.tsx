import { forwardRef, useImperativeHandle, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type WebViewFallbackPlayerHandle = {
  reload: () => void;
};

type WebViewFallbackPlayerProps = ComponentProps<typeof View> & {
  onLoadError?: (message: string) => void;
  uri: string;
};

export const isLikelyWebPageUrl = () => false;

export const WebViewFallbackPlayer = forwardRef<
  WebViewFallbackPlayerHandle,
  WebViewFallbackPlayerProps
>(({ onLoadError, style }, ref) => {
  useImperativeHandle(ref, () => ({
    reload: () => onLoadError?.('当前策略禁止打开网页播放页'),
  }));

  return (
    <View style={[styles.fallback, style]}>
      <Text style={styles.title}>当前策略禁止打开网页播放页</Text>
      <Text style={styles.body}>请先通过 /api/resolve 解析出 m3u8/mp4 直链。</Text>
    </View>
  );
});

WebViewFallbackPlayer.displayName = 'WebViewFallbackPlayer';

const styles = StyleSheet.create({
  body: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 8,
    opacity: 0.82,
    textAlign: 'center',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  title: {
    color: '#f9a8d4',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
