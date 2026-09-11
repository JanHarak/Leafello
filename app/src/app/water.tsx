import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { waterSchedule } from '@dietapp/reminders';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { dayLabel, todayISO } from '@/lib/date';
import { useContentShift } from '@/lib/layout';
import { useLocale } from '@/lib/locale';
import { addWater, getActiveGoal, getWaterMlForDay } from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';
import { AppFooter } from '@/components/AppFooter';
import { DayNav } from '@/components/DayNav';

const QUICK = [200, 330, 500];

export default function Water() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();
  const shift = useContentShift();
  const { lang } = useLocale();
  // Prohlížený den (ISO). Default dnešek; šipkami se lze posouvat do minulosti a zpět.
  const [dateISO, setDateISO] = useState<string>(todayISO);
  const isToday = dateISO === todayISO();

  const [todayMl, setTodayMl] = useState(0);
  const [goalMl, setGoalMl] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    (async () => {
      try {
        const [ml, goal] = await Promise.all([getWaterMlForDay(dateISO), getActiveGoal()]);
        setTodayMl(ml);
        setGoalMl(goal?.water_ml ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [session, dateISO]);

  useFocusEffect(load);

  async function add(ml: number) {
    if (!session || !Number.isFinite(ml) || ml <= 0) return;
    try {
      await addWater(session.user.id, Math.round(ml), isToday ? undefined : dateISO);
      setError(null);
      setCustom('');
      const total = await getWaterMlForDay(dateISO);
      setTodayMl(total);
    } catch (e) {
      console.error('Zápis vody selhal:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const pct = goalMl && goalMl > 0 ? Math.min(1, todayMl / goalMl) : 0;

  // Bloky pitného režimu (F-13): stejné fáze jako v upozorněních, plněné
  // podle dosud vypitého množství (dřívější bloky se plní jako první).
  const blocks = (() => {
    if (!goalMl || goalMl <= 0) return [] as { hour: number; minute: number; ml: number; filled: number }[];
    let cumulative = 0;
    return waterSchedule(goalMl).map((p) => {
      const start = cumulative;
      cumulative += p.ml;
      const filled = Math.max(0, Math.min(1, p.ml > 0 ? (todayMl - start) / p.ml : 0));
      return { ...p, filled };
    });
  })();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={[s.content, { marginRight: shift }]} keyboardShouldPersistTaps="handled">
        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : (
          <>
            {/* Navigace mezi dny (sdílená s deníkem) */}
            <DayNav dateISO={dateISO} onChange={setDateISO} />

            <View style={s.card}>
              <Text style={s.label}>{isToday ? t('water.today') : dayLabel(dateISO, lang).label}</Text>
              <Text style={s.big}>
                {todayMl}{' '}
                <Text style={s.unit}>
                  {goalMl ? t('water.goalSuffix', { goal: goalMl }) : t('goal.unitMl')}
                </Text>
              </Text>
              <View style={s.bar}>
                <View style={[s.barFill, { width: `${pct * 100}%` as `${number}%` }]} />
              </View>
            </View>

            {blocks.length > 0 && (
              <View style={s.card}>
                <Text style={s.label}>{t('water.blocksTitle')}</Text>
                <View style={s.blocksRow}>
                  {blocks.map((b, i) => (
                    <View key={i} style={s.block}>
                      <View style={s.blockTrack}>
                        <View style={[s.blockFill, { height: `${b.filled * 100}%` as `${number}%` }]} />
                      </View>
                      <Text style={s.blockTime}>
                        {b.hour}:{String(b.minute).padStart(2, '0')}
                      </Text>
                      <Text style={s.blockMl}>{b.ml}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={s.quickRow}>
              {QUICK.map((ml) => (
                <Pressable key={ml} style={s.quickButton} onPress={() => add(ml)}>
                  <Text style={s.quickText}>+{ml}</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.customRow}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder={t('water.custom')}
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                style={s.input}
              />
              <Pressable style={s.addButton} onPress={() => add(Number(custom))}>
                <Text style={s.addText}>{t('water.add')}</Text>
              </Pressable>
            </View>

            {error && <Text style={s.error}>{error}</Text>}
          </>
        )}
        <AppFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg, paddingBottom: 0, maxWidth: 960, width: '100%', alignSelf: 'center' },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
    label: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium },
    big: { color: c.accent, fontSize: 40, fontWeight: fontWeight.bold },
    unit: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.regular },
    bar: { height: 8, borderRadius: radius.pill, backgroundColor: c.surfaceElevated, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: radius.pill, backgroundColor: c.accent },
    blocksRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', marginTop: spacing.sm },
    block: { flex: 1, alignItems: 'center', gap: spacing.xs },
    blockTrack: { width: '100%', height: 96, borderRadius: radius.md, backgroundColor: c.surfaceElevated, overflow: 'hidden', justifyContent: 'flex-end' },
    blockFill: { width: '100%', backgroundColor: c.accent, borderRadius: radius.md },
    blockTime: { color: c.textMuted, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
    blockMl: { color: c.textFaint, fontSize: fontSize.caption },
    quickRow: { flexDirection: 'row', gap: spacing.sm },
    quickButton: { flex: 1, minHeight: touchTarget * 1.2, borderRadius: radius.md, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    quickText: { color: c.accent, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    customRow: { flexDirection: 'row', gap: spacing.sm },
    input: { flex: 1, minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    addButton: { minHeight: touchTarget, paddingHorizontal: spacing.xl, backgroundColor: c.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    addText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
