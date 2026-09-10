import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppFooter } from '@/components/AppFooter';
import { Loading } from '@/components/Loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { deleteCoachSummary, generateWeeklyCoach, listCoachSummaries, type CoachSummaryRow } from '@/lib/db';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

const AV_START = require('../../assets/avatar/avatar-coach-start.png');
const AV_RESULT = require('../../assets/avatar/avatar-coach-result.png');

export default function Coach() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();
  const { lang } = useLocale();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [list, setList] = useState<CoachSummaryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setList([]);
        setSelectedId(null);
        return;
      }
      listCoachSummaries()
        .then((rows) => {
          setList(rows);
          setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
        })
        .catch(() => {});
    }, [session]),
  );

  const selected = list.find((r) => r.id === selectedId) ?? null;

  async function generate() {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await generateWeeklyCoach();
      setList((prev) => [row, ...prev]);
      setSelectedId(row.id);
    } catch {
      setError(t('coach.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteCoachSummary(id);
      setList((prev) => {
        const next = prev.filter((r) => r.id !== id);
        setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur));
        return next;
      });
    } catch {
      setError(t('coach.failed'));
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

  const generateBtn = (
    <Pressable style={[s.button, busy && s.dim]} onPress={generate} disabled={busy}>
      <Feather name="refresh-cw" size={18} color={colors.onAccent} />
      <Text style={s.buttonText}>{busy ? t('coach.generating') : list.length ? t('coach.regenerate') : t('coach.generate')}</Text>
    </Pressable>
  );

  const summaryCard = selected && (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.headline}>{selected.summary.headline}</Text>
        <Pressable onPress={() => remove(selected.id)} accessibilityRole="button" accessibilityLabel={t('coach.delete')} hitSlop={8}>
          <Feather name="trash-2" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
      <Text style={s.summary}>{selected.summary.summary}</Text>

      {selected.summary.wins && selected.summary.wins.length > 0 && (
        <View style={s.block}>
          <Text style={s.blockTitle}>{t('coach.winsTitle')}</Text>
          {selected.summary.wins.map((w, i) => (
            <View key={i} style={s.li}>
              <Feather name="check-circle" size={16} color={colors.targetLine} />
              <Text style={s.liText}>{w}</Text>
            </View>
          ))}
        </View>
      )}

      {selected.summary.tips.length > 0 && (
        <View style={s.block}>
          <Text style={s.blockTitle}>{t('coach.tipsTitle')}</Text>
          {selected.summary.tips.map((tip, i) => (
            <View key={i} style={s.li}>
              <Feather name="arrow-right" size={16} color={colors.accent} />
              <Text style={s.liText}>{tip}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.generatedAt}>{t('coach.generatedAt', { date: fmtDate(selected.created_at) })}</Text>
    </View>
  );

  const startAvatar = <Image source={AV_START} style={s.startAvatar} contentFit="contain" accessibilityLabel="" />;
  const resultAvatar = <Image source={AV_RESULT} style={s.resultAvatar} contentFit="contain" accessibilityLabel="" />;

  const archivePanel = (
    <View style={s.archive}>
      <Text style={s.archiveTitle}>{t('coach.archiveTitle')}</Text>
      {list.length === 0 ? (
        <Text style={s.muted}>{t('coach.empty')}</Text>
      ) : (
        list.map((r) => {
          const active = r.id === selectedId;
          return (
            <View key={r.id} style={[s.archiveItem, active && s.archiveItemActive]}>
              <Pressable style={s.archiveItemMain} onPress={() => setSelectedId(r.id)} accessibilityRole="button">
                <Text style={s.archiveDate}>{fmtDate(r.created_at)}</Text>
                <Text style={s.archiveHeadline} numberOfLines={1}>{r.summary.headline}</Text>
              </Pressable>
              <Pressable onPress={() => remove(r.id)} accessibilityRole="button" accessibilityLabel={t('coach.delete')} hitSlop={8} style={s.archiveDelete}>
                <Feather name="trash-2" size={16} color={colors.textFaint} />
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.about}>
          <Text style={s.aboutTitle}>{t('coach.aboutTitle')}</Text>
          <Text style={s.aboutBody}>{t('coach.aboutBody')}</Text>
        </View>

        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : wide ? (
          <View style={s.row}>
            {archivePanel}
            <View style={s.center}>
              {generateBtn}
              {selected ? summaryCard : <View style={s.startWrap}>{startAvatar}</View>}
              {error && <Text style={s.error}>{error}</Text>}
            </View>
            {selected && <View style={s.rightCol}>{resultAvatar}</View>}
          </View>
        ) : (
          <>
            {generateBtn}
            {selected ? (
              <>
                {summaryCard}
                <View style={s.startWrap}>{resultAvatar}</View>
              </>
            ) : (
              <View style={s.startWrap}>{startAvatar}</View>
            )}
            {error && <Text style={s.error}>{error}</Text>}
            {archivePanel}
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

    row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
    center: { flex: 1, gap: spacing.md },
    rightCol: { width: 200, alignItems: 'center', justifyContent: 'flex-start' },

    // Archiv (vlevo)
    archive: { width: 240, gap: spacing.sm },
    archiveTitle: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
    archiveItem: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface },
    archiveItemActive: { borderColor: c.accent },
    archiveItemMain: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
    archiveDate: { color: c.textFaint, fontSize: fontSize.caption },
    archiveHeadline: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    archiveDelete: { padding: spacing.md },

    startWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
    startAvatar: { width: 220, height: 220 },
    resultAvatar: { width: 200, height: 200 },

    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
    headline: { flex: 1, color: c.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
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
