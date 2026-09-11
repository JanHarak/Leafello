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
import { deleteCoachSummary, generateWeeklyCoach, listCoachSummaries, type CoachKind, type CoachSummaryRow } from '@/lib/db';
import { useContentShift } from '@/lib/layout';
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
  const shift = useContentShift();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  // Obsah zůstává na střed; avatar sedí v pravém volném pruhu vedle něj a
  // ukáže se jen tam, kde je pruh dost široký (jinak by byl titěrný / tísnil se).
  const showAvatar = width >= 1440;

  // Denní a týdenní přehled mají samostatný archiv i vybraný výstup (tab).
  const [tab, setTab] = useState<CoachKind>('daily');
  const [lists, setLists] = useState<Record<CoachKind, CoachSummaryRow[]>>({ daily: [], weekly: [] });
  const [selectedIds, setSelectedIds] = useState<Record<CoachKind, string | null>>({ daily: null, weekly: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayISO = () => new Date().toISOString().slice(0, 10);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setLists({ daily: [], weekly: [] });
        setSelectedIds({ daily: null, weekly: null });
        return;
      }
      const today = todayISO();
      Promise.all([listCoachSummaries('daily'), listCoachSummaries('weekly')])
        .then(([daily, weekly]) => {
          setLists({ daily, weekly });
          setSelectedIds((prev) => ({
            // Denní přehled se sám ukáže jen pro dnešek; jiný den → výchozí stav.
            daily: prev.daily ?? (daily[0]?.period_end === today ? daily[0].id : null),
            weekly: prev.weekly ?? weekly[0]?.id ?? null,
          }));
        })
        .catch(() => {});
    }, [session]),
  );

  const list = lists[tab];
  const selectedId = selectedIds[tab];
  const selected = list.find((r) => r.id === selectedId) ?? null;
  const setSelected = (id: string | null) => setSelectedIds((prev) => ({ ...prev, [tab]: id }));

  async function generate() {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await generateWeeklyCoach(tab);
      setLists((prev) => ({ ...prev, [tab]: [row, ...prev[tab]] }));
      setSelectedIds((prev) => ({ ...prev, [tab]: row.id }));
    } catch {
      setError(t('coach.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteCoachSummary(id);
      setLists((prev) => {
        const next = prev[tab].filter((r) => r.id !== id);
        setSelectedIds((cur) => (cur[tab] === id ? { ...cur, [tab]: next[0]?.id ?? null } : cur));
        return { ...prev, [tab]: next };
      });
    } catch {
      setError(t('coach.failed'));
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

  const daily = tab === 'daily';

  // Dostupnost generování:
  // - denní: jen když dnešní přehled ještě není (jinak až zítra / po smazání),
  // - týdenní: nejdřív 7 dní od posledního týdenního přehledu.
  const today = todayISO();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const dailyDoneToday = lists.daily[0]?.period_end === today;
  const lastWeekly = lists.weekly[0];
  const weeklyLockedUntil = lastWeekly ? new Date(new Date(lastWeekly.created_at).getTime() + WEEK_MS) : null;
  const weeklyLocked = weeklyLockedUntil ? weeklyLockedUntil.getTime() > Date.now() : false;
  const canGenerate = daily ? !dailyDoneToday : !weeklyLocked;

  const tabsBar = (
    <View style={s.tabRow}>
      {(['daily', 'weekly'] as CoachKind[]).map((k) => {
        const active = tab === k;
        return (
          <Pressable
            key={k}
            style={[s.tab, active && s.tabActive]}
            onPress={() => {
              setTab(k);
              setError(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Feather name={k === 'daily' ? 'sun' : 'calendar'} size={18} color={active ? colors.accent : colors.textMuted} />
            <Text style={[s.tabText, active && s.tabTextActive]}>{t(k === 'daily' ? 'coach.tabDaily' : 'coach.tabWeekly')}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const generateBtn = (
    <Pressable style={[s.button, busy && s.dim]} onPress={generate} disabled={busy}>
      <Feather name="refresh-cw" size={18} color={colors.onAccent} />
      <Text style={s.buttonText}>
        {busy ? t('coach.generating') : daily ? t('coach.dailyGenerate') : list.length ? t('coach.regenerate') : t('coach.generate')}
      </Text>
    </Pressable>
  );

  // Když generovat nelze, místo tlačítka jemná poznámka proč.
  const lockNote = (
    <Text style={s.muted}>
      {daily ? t('coach.dailyDoneToday') : t('coach.weeklyNextAvailable', { date: weeklyLockedUntil ? fmtDate(weeklyLockedUntil.toISOString()) : '' })}
    </Text>
  );
  const action = canGenerate ? generateBtn : lockNote;

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
          <Text style={s.blockTitle}>{t(daily ? 'coach.dailyTipsTitle' : 'coach.tipsTitle')}</Text>
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

  // heroAvatar = placeholder v obsahovém sloupci (střídmá velikost),
  // gutterAvatar = výsledek v pravém pruhu (vyplní pruh, procenta/responzivní).
  const startAvatar = (
    <Image source={AV_START} style={s.heroAvatarImg} contentFit="contain" priority="high" transition={0} cachePolicy="memory-disk" accessibilityLabel="" />
  );
  const resultAvatar = (
    <Image source={AV_RESULT} style={s.heroAvatarImg} contentFit="contain" priority="high" transition={0} cachePolicy="memory-disk" accessibilityLabel="" />
  );
  const gutterAvatar = (
    <Image source={AV_RESULT} style={s.gutterAvatarImg} contentFit="contain" priority="high" transition={0} cachePolicy="memory-disk" accessibilityLabel="" />
  );

  const archivePanel = (
    <View style={s.archive}>
      <Text style={s.archiveTitle}>{t('coach.archiveTitle')}</Text>
      {list.length === 0 ? (
        <Text style={s.muted}>{t(daily ? 'coach.dailyEmpty' : 'coach.empty')}</Text>
      ) : (
        list.map((r) => {
          const active = r.id === selectedId;
          return (
            <View key={r.id} style={[s.archiveItem, active && s.archiveItemActive]}>
              <Pressable style={s.archiveItemMain} onPress={() => setSelected(r.id)} accessibilityRole="button">
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

  const aboutCard = (
    <View style={s.about}>
      <Text style={s.aboutTitle}>{t(daily ? 'coach.dailyAboutTitle' : 'coach.aboutTitle')}</Text>
      <Text style={s.aboutBody}>{t(daily ? 'coach.dailyAboutBody' : 'coach.aboutBody')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={[s.content, { paddingRight: spacing.xl + shift }]}>
        {!session ? (
          <View style={s.block960}>
            {aboutCard}
            <Text style={s.muted}>{t('auth.subtitle')}</Text>
          </View>
        ) : (
          <>
            {/* Přepínač denní / týdenní – nad obsahem, na střed */}
            <View style={s.block960}>{tabsBar}</View>
            {wide ? (
              /* Archiv vlevo mimo (na úrovni boxu), box+tlačítko+výstup na střed (960), avatar vpravo mimo */
              <View style={s.wideRow}>
                <View style={s.sideLeft}>{archivePanel}</View>
                <View style={s.centerCol}>
                  {aboutCard}
                  {action}
                  {error && <Text style={s.error}>{error}</Text>}
                  {selected ? summaryCard : <View style={s.startWrap}>{startAvatar}</View>}
                </View>
                <View style={s.sideRight}>{selected && showAvatar ? gutterAvatar : null}</View>
              </View>
            ) : (
              <View style={s.block960}>
                {aboutCard}
                {action}
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
              </View>
            )}
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
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.md, paddingBottom: 0, width: '100%' },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    // Střed (box, tlačítko, výstup) je na 960 jako ostatní sekce.
    block960: { width: '100%', maxWidth: 960, alignSelf: 'center', gap: spacing.md },

    // Segmentový přepínač denní / týdenní – konzistentní se sekcí Recepty.
    tabRow: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, backgroundColor: c.surfaceElevated, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
    tab: { flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
    tabActive: { backgroundColor: c.surface, shadowColor: c.text, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    tabText: { color: c.textMuted, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    tabTextActive: { color: c.text, fontWeight: fontWeight.bold },
    about: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    aboutTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    aboutBody: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },

    // Obsah (max 960) je na střed viewportu díky symetrickým pruhům: vlevo
    // archiv, vpravo avatar (oba flexGrow:1, stejně široké). Avatar má
    // width:100 % svého pruhu (maxWidth 440), takže se drží ve volném pruhu a
    // nikdy nepřekrývá obsah. flexGrow řádku vyplní výšku pro svislé vycentrování.
    wideRow: { flexGrow: 1, flexDirection: 'row', width: '100%', alignItems: 'flex-start', gap: spacing.lg },
    sideLeft: { flexGrow: 1, flexShrink: 1, flexBasis: 0, alignItems: 'flex-start' },
    centerCol: { flexGrow: 0, flexShrink: 1, flexBasis: 960, maxWidth: 960, gap: spacing.md },
    sideRight: { flexGrow: 1, flexShrink: 1, flexBasis: 0, alignSelf: 'stretch', alignItems: 'flex-start', justifyContent: 'center' },
    // Placeholder v obsahu (střídmý) vs. výsledek v pravém pruhu (vyplní pruh).
    heroAvatarImg: { width: '100%', maxWidth: 460, aspectRatio: 1 },
    gutterAvatarImg: { width: '100%', maxWidth: 720, aspectRatio: 1 },

    // Archiv (vlevo)
    archive: { width: 240, gap: spacing.sm },
    archiveTitle: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
    archiveItem: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface },
    archiveItemActive: { borderColor: c.accent },
    archiveItemMain: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
    archiveDate: { color: c.textFaint, fontSize: fontSize.caption },
    archiveHeadline: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    archiveDelete: { padding: spacing.md },

    startWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },

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
