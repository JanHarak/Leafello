import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing } from '@/theme';

/**
 * Tlačítko s popiskem, který se ukáže při najetí myší (web). Popisek je
 * vysvětlivka k ikoně; na dotykových zařízeních slouží accessibilityLabel.
 */
export function Tooltip({
  label,
  onPress,
  children,
  style,
}: {
  label: string;
  onPress?: () => void;
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const { colors } = useTheme();
  const [hover, setHover] = useState(false);

  return (
    <View style={{ position: 'relative', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        style={[style, hover && { backgroundColor: colors.hover}]}
      >
        {children}
      </Pressable>
      {hover && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'center', marginBottom: spacing.xs }}>
          <View style={{ backgroundColor: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
            <Text numberOfLines={1} style={{ color: colors.background, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>
              {label}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
