import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, spacing, type ThemeColors } from '@/theme';

/**
 * Patička s právními odkazy a atribucemi dat. Vykresluje se na konci obsahu
 * (uvnitř ScrollView každé obrazovky), takže není přilepená dole, ale doscrolluje
 * se k ní na konci stránky.
 */
export function AppFooter() {
  const { colors } = useTheme();
  const s = styles(colors);
  const router = useRouter();
  return (
    <View style={s.footer}>
      <View style={s.links}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/legal/privacy')}>
          <Text style={s.link}>{t('legal.privacy')}</Text>
        </Pressable>
        <Text style={s.dot}>·</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/legal/terms')}>
          <Text style={s.link}>{t('legal.terms')}</Text>
        </Pressable>
      </View>
      <Text style={s.attr}>{t('attribution.off')}</Text>
      <Text style={s.attr}>{t('attribution.nutridb')}</Text>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    footer: { alignSelf: 'center', width: '100%', maxWidth: 960, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.xl, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, alignItems: 'center', gap: 2, marginTop: 'auto', marginBottom: spacing.xs },
    links: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    link: { color: c.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
    dot: { color: c.textFaint, fontSize: fontSize.caption },
    attr: { color: c.textFaint, fontSize: fontSize.caption, textAlign: 'center' },
  });
