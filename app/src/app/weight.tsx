import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WeightChart } from '@/components/WeightChart';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { listWeights, upsertWeight, type WeightRow } from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

/** 7denní (7bodový) klouzavý průměr přes seřazené hodnoty. */
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
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    (async () => {
      try {
        setRows(await listWeights());
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
      await upsertWeight(session.user.id, w);
      setInput('');
      setSaved(true);
      setError(null);
      setRows(await listWeights());
    } catch (e) {
      console.error('Uložení váhy selhalo:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const raw = useMemo(() => rows.map((r) => r.weight_kg), [rows]);
  const avg = useMemo(() => movingAverage(raw), [raw]);
  const latestAvg = avg.length ? avg[avg.length - 1] : null;
  const min = raw.length ? Math.min(...raw) : 0;
  const max = raw.length ? Math.max(...raw) : 0;
  const recent = rows.slice(-14);

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

            {rows.length >= 2 && (
              <View style={s.card}>
                <Text style={s.label}>{t('weight.trend')}</Text>
                <WeightChart
                  points={rows.slice(-30).map((r) => ({ date: r.logged_on, kg: r.weight_kg }))}
                  color={colors.accent}
                  gridColor={colors.border}
                />
                <View style={s.chartAxis}>
                  <Text style={s.axisLabel}>{min.toFixed(1)}</Text>
                  <Text style={s.axisLabel}>{max.toFixed(1)} {t('weight.unitKg')}</Text>
                </View>
              </View>
            )}

            {rows.length === 0 && <Text style={s.muted}>{t('weight.empty')}</Text>}

            {recent
              .slice()
              .reverse()
              .map((r) => (
                <View key={r.logged_on} style={s.entryRow}>
                  <Text style={s.entryDate}>{r.logged_on}</Text>
                  <Text style={s.entryVal}>{r.weight_kg.toFixed(1)} {t('weight.unitKg')}</Text>
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
    entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    entryDate: { color: c.textMuted, fontSize: fontSize.body },
    entryVal: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
  });
