import { useId } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { brandLeafGreens } from '@/theme';

/**
 * Dekorativní list vykreslený jako SVG (ne obrázek), aby odpovídal rozházeným
 * listům z návrhu úvodní obrazovky. Plný list se světle→tmavě zeleným
 * gradientem, střední žilkou a bočními žilkami. Barvy, velikost i natočení řídí
 * volající, takže lze snadno rozmístit více variant kolem stránky.
 */
export function Leaf({
  size = 60,
  from = brandLeafGreens.light,
  to = brandLeafGreens.deep,
  vein = brandLeafGreens.vein,
  style,
}: {
  size?: number;
  from?: string;
  to?: string;
  vein?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const gradId = useId();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <Defs>
        <LinearGradient id={gradId} x1="20" y1="10" x2="80" y2="95" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      {/* Plné tělo listu – symetrický špičatý ovál */}
      <Path d="M50 5 C71 21 75 53 50 95 C25 53 29 21 50 5 Z" fill={`url(#${gradId})`} />
      {/* Střední žilka */}
      <Path d="M50 14 L50 88" stroke={vein} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.7} />
      {/* Boční žilky */}
      <Path
        d="M50 34 C43 33 38 35 34 41 M50 34 C57 33 62 35 66 41 M50 52 C42 51 36 54 32 61 M50 52 C58 51 64 54 68 61"
        stroke={vein}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
    </Svg>
  );
}
