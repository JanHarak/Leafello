import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Markdown } from '@/components/Markdown';
import { t } from '@/i18n';
import { TERMS_MARKDOWN } from '@/legal/content';
import { colorsFor, spacing } from '@/theme';

export default function Terms() {
  const colors = colorsFor(useColorScheme());
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: t('legal.terms'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown source={TERMS_MARKDOWN} colors={colors} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
});
