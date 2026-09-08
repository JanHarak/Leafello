import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WeightChart } from '@/components/WeightChart';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { deleteWeight, getActiveGoal, listWeights, upsertWeight, type WeightRow } from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

/** 7denní klouzavý průměr přes seřazené hodnoty. */
function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = values.slice(from, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export default function Weight() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();

  const [rows, setRows] = useState<WeightRow[]>([]);
  const [targetKg, setTargetKg] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [editDate, setEditDate] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    (async () => {
      try {
        const [w, goal] = await Promise.all([listWeights(), getActiveGoal()]);
        setRows(w);
        setTargetKg(goal?.target_weight_kg != null ? Number(goal.target_weight_kg) : null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [session]);

  useFocusEffect(load);

  async function save() {
    if (!session) return;
    const w = Number(input);
    if (Number.isNaN(w) || w < 25 || w > 400) {
      setError(t('weight.placeholder'));
      return;
    }
    try {
      await upsertWeight(session.user.id, w, editDate ?? undefined);
      setInput('');
      setEditDate(null);
      setSaved(true);
      setError(null);
      const [ww, goal] = await Promise.all([listWeights(), getActiveGoal()]);
      setRows(ww);
      setTargetKg(goal?.target_weight_kg != null ? Number(goal.target_weight_kg) : null);
    } catch (e) {
      console.error('Uložení váhy selhalo:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function editEntry(r: WeightRow) {
    setInput(String(r.weight_kg));
    setEditDate(r.logged_on);
    setSaved(false);
  }

  async function removeEntry(r: WeightRow) {
    if (!session) return;
    try {
      await deleteWeight(r.logged_on);
      if (editDate === r.logged_on) {
        setEditDate(null);
        setInput('');
      }
      setRows(await listWeights());
    } catch (e) {
      console.error('Smazání váhy selhalo:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const raw = useMemo(() => rows.map((r) => r.weight_kg), [rows]);
  const avg = useMemo(() => movingAverage(raw), [raw]);
  const latestAvg = avg.length ? avg[avg.length - 1] : null;

  // Graf: osa X = dny aktuálního měsíce, osa Y = zadaná (nejstarší) váha ±10.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const points = rows
    .filter((r) => r.logged_on.startsWith(monthPrefix))
    .map((r) => ({ day: Number(r.logged_on.slice(8, 10)), kg: r.weight_kg }));

  // Osa Y: ~5 kg pod cílem a ~5 kg nad zadanou (nejstarší) váhou, a VŽDY aspoň
  // 2 kg nad/pod nejzazší zapsanou hodnotou (aby bod nikdy neležel na hraně).
  // Zaokrouhleno na 5 kg kvůli čistým popiskům.
  const baseline = rows.length ? rows[0].weight_kg : (targetKg ?? 80);
  const vals = [...points.map((p) => p.kg), baseline, ...(targetKg != null ? [targetKg] : [])];
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const loRef = Math.min(dataMin - 2, targetKg != null ? targetKg - 5 : dataMin - 2);
  const hiRef = Math.max(dataMax + 2, baseline + 5);
  const yMin = Math.floor(loRef / 5) * 5;
  const yMax = Math.ceil(hiRef / 5) * 5;
  const showChart = rows.length > 0 || targetKg !== null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : (
          <>
            <View style={s.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('weight.placeholder')}
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                style={s.input}
              />
              <Pressable style={s.saveButton} onPress={save}>
                <Text style={s.saveText}>{t('weight.save')}</Text>
              </Pressable>
            </View>
            {editDate && <Text style={s.muted}>{editDate}</Text>}
            {saved && <Text style={s.saved}>{t('weight.saved')}</Text>}
            {error && <Text style={s.error}>{error}</Text>}

            {latestAvg !== null && (
              <View style={s.card}>
                <Text style={s.label}>{t('weight.average')}</Text>
                <Text style={s.big}>
                  {latestAvg.toFixed(1)} <Text style={s.unit}>{t('weight.unitKg')}</Text>
                </Text>
              </View>
            )}

            {showChart && (
              <View style={s.card}>
                <Text style={s.label}>{t('weight.trend')}</Text>
                <WeightChart
                  points={points}
                  daysInMonth={daysInMonth}
                  yMin={yMin}
                  yMax={yMax}
                  targetKg={targetKg}
                  color={colors.accent}
                  gridColor={colors.border}
                  targetColor={colors.targetLine}
                  textColor={colors.textFaint}
                />
                <View style={s.legendRow}>
                  <Text style={s.axisLabel}>{t('weight.days')} · {t('weight.unitKg')}</Text>
                  {targetKg !== null && (
                    <View style={s.legendItem}>
                      <View style={s.legendDash} />
                      <Text style={s.axisLabel}>{t('weight.targetLegend', { kg: targetKg })}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {rows.length === 0 && <Text style={s.muted}>{t('weight.empty')}</Text>}

            {rows
              .slice()
              .reverse()
              .map((r) => (
                <View key={r.logged_on} style={s.entryRow}>
                  <Text style={s.entryDate}>{r.logged_on}</Text>
                  <View style={s.entryRight}>
                    <Text style={s.entryVal}>{r.weight_kg.toFixed(1)} {t('weight.unitKg')}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} onPress={() => editEntry(r)} hitSlop={8}>
                      <Text style={s.entryEdit}>{t('common.edit')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={() => removeEntry(r)} hitSlop={8}>
                      <Text style={s.entryDelete}>×</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.md },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    inputRow: { flexDirection: 'row', gap: spacing.sm },
    input: { flex: 1, minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    saveButton: { minHeight: touchTarget, paddingHorizontal: spacing.lg, backgroundColor: c.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    saveText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    saved: { color: c.accent, fontSize: fontSize.body },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
    label: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium },
    big: { color: c.text, fontSize: 40, fontWeight: fontWeight.bold },
    unit: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.regular },
    chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
    axisLabel: { color: c.textFaint, fontSize: fontSize.caption },
    legendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    legendDash: { width: 16, height: 2, backgroundColor: c.targetLine },
    entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    entryDate: { color: c.textMuted, fontSize: fontSize.body },
    entryRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    entryVal: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    entryEdit: { color: c.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
    entryDelete: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
  });
