import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFooter } from '@/components/AppFooter';
import { Loading } from '@/components/Loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { generateWeeklyCoach, getCoachSummary, type CoachSummaryRow } from '@/lib/db';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

export default function Coach() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();
  const { lang } = useLocale();

  const [row, setRow] = useState<CoachSummaryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setRow(null);
        return;
      }
      getCoachSummary()
        .then(setRow)
        .catch(() => {});
    }, [session]),
  );

  async function generate() {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      setRow(await generateWeeklyCoach());
    } catch {
      setError(t('coach.failed'));
    } finally {
      setBusy(false);
    }
  }

  const generatedLabel = row
    ? new Date(row.created_at).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.about}>
          <Text style={s.aboutTitle}>{t('coach.aboutTitle')}</Text>
          <Text style={s.aboutBody}>{t('coach.aboutBody')}</Text>
        </View>

        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : (
          <>
            {row ? (
              <View style={s.card}>
                <Text style={s.headline}>{row.summary.headline}</Text>
                <Text style={s.summary}>{row.summary.summary}</Text>

                {row.summary.wins && row.summary.wins.length > 0 && (
                  <View style={s.block}>
                    <Text style={s.blockTitle}>{t('coach.winsTitle')}</Text>
                    {row.summary.wins.map((w, i) => (
                      <View key={i} style={s.li}>
                        <Feather name="check-circle" size={16} color={colors.targetLine} />
                        <Text style={s.liText}>{w}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {row.summary.tips.length > 0 && (
                  <View style={s.block}>
                    <Text style={s.blockTitle}>{t('coach.tipsTitle')}</Text>
                    {row.summary.tips.map((tip, i) => (
                      <View key={i} style={s.li}>
                        <Feather name="arrow-right" size={16} color={colors.accent} />
                        <Text style={s.liText}>{tip}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={s.generatedAt}>{t('coach.generatedAt', { date: generatedLabel })}</Text>
              </View>
            ) : (
              <Text style={s.muted}>{t('coach.empty')}</Text>
            )}

            <Pressable style={[s.button, busy && s.dim]} onPress={generate} disabled={busy}>
              <Feather name="refresh-cw" size={18} color={colors.onAccent} />
              <Text style={s.buttonText}>{busy ? t('coach.generating') : row ? t('coach.regenerate') : t('coach.generate')}</Text>
            </Pressable>

            {error && <Text style={s.error}>{error}</Text>}
          </>
        )}
        <AppFooter />
      </ScrollView>
      {busy && <Loading overlay />}
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.md, paddingBottom: 0, maxWidth: 960, width: '100%', alignSelf: 'center' },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    about: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    aboutTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    aboutBody: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },

    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
    headline: { color: c.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
    summary: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    block: { gap: spacing.sm },
    blockTitle: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    li: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    liText: { flex: 1, color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.45 },
    generatedAt: { color: c.textFaint, fontSize: fontSize.caption, marginTop: spacing.xs },

    button: { minHeight: touchTarget * 1.2, flexDirection: 'row', gap: spacing.sm, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    dim: { opacity: 0.6 },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
