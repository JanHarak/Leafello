import { mealSchedule, waterSchedule } from '@dietapp/reminders';
import { Stack, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { getActiveGoal } from '@/lib/db';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

function fmt(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function Reminders() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);
  const { session } = useAuth();

  const [goalMl, setGoalMl] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      getActiveGoal()
        .then((g) => setGoalMl(g?.water_ml ?? null))
        .catch(() => {});
    }, [session]),
  );

  const water = useMemo(() => waterSchedule(goalMl ?? 2000, 5, 8, 20), [goalMl]);
  const meals = useMemo(() => mealSchedule(), []);

  async function toggle() {
    setNote(null);
    if (Platform.OS === 'web') {
      // Na webu jen náhled – plánování notifikací je záležitost mobilní appky.
      setEnabled((v) => !v);
      setNote(t('reminders.webNote'));
      return;
    }
    if (enabled) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      setEnabled(false);
      return;
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      setNote(t('reminders.denied'));
      return;
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const p of water) {
      await Notifications.scheduleNotificationAsync({
        content: { title: t('app.name'), body: t('reminders.waterBody', { ml: p.ml }) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: p.hour, minute: p.minute },
      });
    }
    for (const m of meals) {
      await Notifications.scheduleNotificationAsync({
        content: { title: t('app.name'), body: t('reminders.mealBody', { meal: t(`meal.${m.meal}`) }) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: m.hour, minute: m.minute },
      });
    }
    setEnabled(true);
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('reminders.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>{t('reminders.intro')}</Text>

        <Pressable style={[s.toggle, { backgroundColor: enabled ? colors.surface : colors.accent, borderColor: colors.accent }]} onPress={toggle}>
          <Text style={[s.toggleText, { color: enabled ? colors.accent : colors.onAccent }]}>
            {enabled ? t('reminders.disable') : t('reminders.enable')}
          </Text>
        </Pressable>

        {enabled && <Text style={s.enabled}>{t('reminders.enabled')}</Text>}
        {note && <Text style={s.note}>{note}</Text>}

        <Text style={s.section}>{t('reminders.water')}</Text>
        {water.map((p, i) => (
          <View key={`w${i}`} style={s.row}>
            <Text style={s.time}>{fmt(p.hour, p.minute)}</Text>
            <Text style={s.detail}>{p.ml} {t('goal.unitMl')}</Text>
          </View>
        ))}

        <Text style={s.section}>{t('reminders.meals')}</Text>
        {meals.map((m, i) => (
          <View key={`m${i}`} style={s.row}>
            <Text style={s.time}>{fmt(m.hour, m.minute)}</Text>
            <Text style={s.detail}>{t(`meal.${m.meal}`)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.sm },
    intro: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    toggle: { minHeight: touchTarget, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
    toggleText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
    enabled: { color: c.accent, fontSize: fontSize.body },
    note: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
    section: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    time: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    detail: { color: c.textMuted, fontSize: fontSize.body },
  });
