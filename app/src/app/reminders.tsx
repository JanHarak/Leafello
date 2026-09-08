import { waterSchedule } from '@dietapp/reminders';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  DEFAULT_REMINDER_TIMES,
  getActiveGoal,
  getReminderPrefs,
  setReminderPrefs,
  setReminderTimes,
  type ReminderChannel,
  type ReminderTimes,
} from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type MealKey = 'breakfast' | 'lunch' | 'dinner';

function parseHM(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return { hour: 8, minute: 0 };
  return { hour: Math.min(23, Number(m[1])), minute: Math.min(59, Number(m[2])) };
}
function fmt(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function Reminders() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();

  const [goalMl, setGoalMl] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [channel, setChannel] = useState<ReminderChannel>('email');
  const [times, setTimes] = useState<ReminderTimes>(DEFAULT_REMINDER_TIMES);
  const [note, setNote] = useState<string | null>(null);

  const CHANNELS: { key: ReminderChannel; label: string }[] = [
    { key: 'email', label: t('reminders.channelEmail') },
    { key: 'push', label: t('reminders.channelPush') },
    { key: 'both', label: t('reminders.channelBoth') },
  ];

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      getActiveGoal()
        .then((g) => setGoalMl(g?.water_ml ?? null))
        .catch(() => {});
      if (Platform.OS === 'web') {
        getReminderPrefs()
          .then((p) => {
            setEnabled(p.enabled);
            setChannel(p.channel);
            setTimes(p.times);
            if (p.enabled) setNote(t('reminders.emailNote'));
          })
          .catch(() => {});
      }
    }, [session]),
  );

  const water = useMemo(
    () => waterSchedule(goalMl ?? 2000, 5, times.waterStart, times.waterEnd),
    [goalMl, times.waterStart, times.waterEnd],
  );
  const meals: { key: MealKey; hour: number; minute: number }[] = (['breakfast', 'lunch', 'dinner'] as MealKey[]).map((k) => ({
    key: k,
    ...parseHM(times[k]),
  }));

  async function toggle() {
    setNote(null);
    if (Platform.OS === 'web') {
      if (!session) return;
      const next = !enabled;
      try {
        await setReminderPrefs(session.user.id, session.user.email ?? null, next, channel);
        setEnabled(next);
        setNote(next ? t('reminders.emailNote') : null);
      } catch (e) {
        setNote(e instanceof Error ? e.message : String(e));
      }
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
        content: { title: t('app.name'), body: t('reminders.mealBody', { meal: t(`meal.${m.key}`) }) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: m.hour, minute: m.minute },
      });
    }
    setEnabled(true);
  }

  async function changeChannel(ch: ReminderChannel) {
    setChannel(ch);
    if (Platform.OS === 'web' && session && enabled) {
      try {
        await setReminderPrefs(session.user.id, session.user.email ?? null, true, ch);
      } catch (e) {
        setNote(e instanceof Error ? e.message : String(e));
      }
    }
  }

  function setTime<K extends keyof ReminderTimes>(key: K, value: ReminderTimes[K]) {
    setTimes((prev) => ({ ...prev, [key]: value }));
  }

  async function saveTimes() {
    if (!session) return;
    // Rozsah pití ohlídáme (start < end, 0..23).
    const startH = Math.min(23, Math.max(0, Math.round(times.waterStart)));
    let endH = Math.min(23, Math.max(0, Math.round(times.waterEnd)));
    if (endH <= startH) endH = Math.min(23, startH + 1);
    const clean: ReminderTimes = { ...times, waterStart: startH, waterEnd: endH };
    setTimes(clean);
    try {
      await setReminderTimes(session.user.id, clean);
      setNote(t('reminders.timesSaved'));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }

  const weigh = parseHM(times.weigh);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>{t('reminders.intro')}</Text>

        <Pressable style={[s.toggle, { backgroundColor: enabled ? colors.surface : colors.accent, borderColor: colors.accent }]} onPress={toggle}>
          <Text style={[s.toggleText, { color: enabled ? colors.accent : colors.onAccent }]}>
            {enabled ? t('reminders.disable') : t('reminders.enable')}
          </Text>
        </Pressable>

        {enabled && <Text style={s.enabled}>{t('reminders.enabled')}</Text>}

        {Platform.OS === 'web' && (
          <>
            <Text style={s.section}>{t('reminders.channelLabel')}</Text>
            <View style={s.channelRow}>
              {CHANNELS.map((ch) => {
                const active = channel === ch.key;
                return (
                  <Pressable
                    key={ch.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => changeChannel(ch.key)}
                    style={[s.channelChip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}
                  >
                    <Text style={{ color: active ? colors.onAccent : colors.text, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>{ch.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {(channel === 'push' || channel === 'both') && <Text style={s.note}>{t('reminders.pushNote')}</Text>}
          </>
        )}

        {note && <Text style={s.note}>{note}</Text>}

        {/* Nastavení časů */}
        <Text style={s.section}>{t('reminders.timesTitle')}</Text>
        <View style={s.timeRow}>
          <Text style={s.timeLabel}>{t('reminders.waterFrom')}</Text>
          <TextInput value={String(times.waterStart)} onChangeText={(v) => setTime('waterStart', Number(v) || 0)} keyboardType="numeric" style={s.timeInput} />
          <Text style={s.timeLabel}>{t('reminders.waterTo')}</Text>
          <TextInput value={String(times.waterEnd)} onChangeText={(v) => setTime('waterEnd', Number(v) || 0)} keyboardType="numeric" style={s.timeInput} />
        </View>
        {(['breakfast', 'lunch', 'dinner'] as MealKey[]).map((k) => (
          <View key={k} style={s.timeRow}>
            <Text style={s.timeLabel}>{t(`meal.${k}`)}</Text>
            <TextInput value={times[k]} onChangeText={(v) => setTime(k, v)} placeholder="HH:MM" placeholderTextColor={colors.textFaint} style={s.timeInput} />
          </View>
        ))}
        <View style={s.timeRow}>
          <Text style={s.timeLabel}>{t('reminders.weighTitle')}</Text>
          <TextInput value={times.weigh} onChangeText={(v) => setTime('weigh', v)} placeholder="HH:MM" placeholderTextColor={colors.textFaint} style={s.timeInput} />
        </View>
        <Pressable style={s.saveTimes} onPress={saveTimes}>
          <Text style={s.saveTimesText}>{t('reminders.saveTimes')}</Text>
        </Pressable>

        {/* Náhled rozvrhu */}
        <Text style={s.section}>{t('reminders.water')}</Text>
        {water.map((p, i) => (
          <View key={`w${i}`} style={s.row}>
            <Text style={s.time}>{fmt(p.hour, p.minute)}</Text>
            <Text style={s.detail}>{p.ml} {t('goal.unitMl')}</Text>
          </View>
        ))}

        <Text style={s.section}>{t('reminders.meals')}</Text>
        {meals.map((m) => (
          <View key={m.key} style={s.row}>
            <Text style={s.time}>{fmt(m.hour, m.minute)}</Text>
            <Text style={s.detail}>{t(`meal.${m.key}`)}</Text>
          </View>
        ))}

        <Text style={s.section}>{t('reminders.weighTitle')}</Text>
        <View style={s.row}>
          <Text style={s.time}>{fmt(weigh.hour, weigh.minute)}</Text>
          <Text style={s.detail}>{t('reminders.weighInfo')}</Text>
        </View>
        <Text style={s.intro}>{t('reminders.weighBody')}</Text>
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
    channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    channelChip: { minHeight: touchTarget, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
    note: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
    section: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.lg },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    timeLabel: { color: c.textMuted, fontSize: fontSize.body, minWidth: 90 },
    timeInput: { minHeight: touchTarget, width: 90, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    saveTimes: { minHeight: touchTarget, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm, alignSelf: 'flex-start' },
    saveTimesText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    time: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    detail: { color: c.textMuted, fontSize: fontSize.body },
  });
