
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Markdown } from '@/components/Markdown';
import { t } from '@/i18n';
import { TERMS_MARKDOWN } from '@/legal/content';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/theme';

export default function Terms() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
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
