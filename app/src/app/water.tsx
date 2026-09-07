import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addWater, getActiveGoal, getTodayWaterMl } from '@/lib/db';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

const QUICK = [200, 330, 500];

export default function Water() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);
  const { session } = useAuth();

  const [todayMl, setTodayMl] = useState(0);
  const [goalMl, setGoalMl] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    (async () => {
      try {
        const [ml, goal] = await Promise.all([getTodayWaterMl(), getActiveGoal()]);
        setTodayMl(ml);
        setGoalMl(goal?.water_ml ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [session]);

  useFocusEffect(load);

  async function add(ml: number) {
    if (!session || !Number.isFinite(ml) || ml <= 0) return;
    try {
      await addWater(session.user.id, Math.round(ml));
      setError(null);
      setCustom('');
      const total = await getTodayWaterMl();
      setTodayMl(total);
    } catch (e) {
      console.error('Zápis vody selhal:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const pct = goalMl && goalMl > 0 ? Math.min(1, todayMl / goalMl) : 0;

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('water.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : (
          <>
            <View style={s.card}>
              <Text style={s.label}>{t('water.today')}</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.lg },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
    label: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium },
    big: { color: c.accent, fontSize: 40, fontWeight: fontWeight.bold },
    unit: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.regular },
    bar: { height: 8, borderRadius: radius.pill, backgroundColor: c.surfaceElevated, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: radius.pill, backgroundColor: c.accent },
    quickRow: { flexDirection: 'row', gap: spacing.sm },
    quickButton: { flex: 1, minHeight: touchTarget * 1.2, borderRadius: radius.md, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    quickText: { color: c.accent, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    customRow: { flexDirection: 'row', gap: spacing.sm },
    input: { flex: 1, minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    addButton: { minHeight: touchTarget, paddingHorizontal: spacing.xl, backgroundColor: c.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    addText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
