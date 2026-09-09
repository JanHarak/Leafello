import Lottie from 'lottie-react';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/lib/theme';

// Lottie loader (web). Na nativu se použije Loading.native.tsx (ActivityIndicator),
// aby se do mobilního bundlu netahal velký JSON.
const SOURCE = require('../../assets/loading.json');

// Velikost animace v px: OVERLAY_SIZE = celoobrazovkový overlay, DEFAULT_SIZE
// = inline použití (lze přepsat propem `size`). Tady uprav velikost loadingu.
const OVERLAY_SIZE = 320;
const DEFAULT_SIZE = 180;

// Rozostření pozadí overlaye (jen web; na nativu se ignoruje).
const BLUR = Platform.OS === 'web'
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any)
  : null;

/**
 * Indikátor načítání.
 * - `overlay` = vrstva přes celou plochu: transparentní rozostřené pozadí
 *   s animací uprostřed (žádný box).
 * - `fullscreen` = vycentrováno přes celou plochu.
 * - jinak inline.
 */
export function Loading({
  size = DEFAULT_SIZE,
  fullscreen = false,
  overlay = false,
}: {
  size?: number;
  fullscreen?: boolean;
  overlay?: boolean;
}) {
  const { colors } = useTheme();
  const dim = overlay ? OVERLAY_SIZE : size;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anim = <Lottie animationData={SOURCE as any} loop autoplay style={{ width: dim, height: dim }} />;

  if (overlay) {
    return (
      <View
        accessibilityRole="progressbar"
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center', zIndex: 100, backgroundColor: colors.scrim },
          BLUR,
        ]}
      >
        {anim}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="progressbar"
      style={[{ alignItems: 'center', justifyContent: 'center' }, fullscreen ? { flex: 1, backgroundColor: colors.background } : null]}
    >
      {anim}
    </View>
  );
}
