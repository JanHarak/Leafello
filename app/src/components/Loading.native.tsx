import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/lib/theme';

/**
 * Nativní fallback loaderu (bez Lottie, aby se do mobilního bundlu netahal
 * velký JSON). Stejné API jako web verze. Overlay = vrstva přes celou plochu
 * s transparentním pozadím a spinnerem uprostřed (bez boxu).
 */
export function Loading({ fullscreen = false, overlay = false }: { size?: number; fullscreen?: boolean; overlay?: boolean }) {
  const { colors } = useTheme();
  const spinner = <ActivityIndicator size="large" color={colors.accent} />;

  if (overlay) {
    return (
      <View
        accessibilityRole="progressbar"
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 100, backgroundColor: colors.scrim }]}
      >
        {spinner}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="progressbar"
      style={[{ alignItems: 'center', justifyContent: 'center' }, fullscreen ? { flex: 1, backgroundColor: colors.background } : null]}
    >
      {spinner}
    </View>
  );
}
