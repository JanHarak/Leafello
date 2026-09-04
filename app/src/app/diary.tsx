import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dailyTotals, entrySnapshot, type Nutrition } from '@dietapp/diary';

import { SAMPLE_FOODS, type SampleFood } from '@/data/sampleFoods';
import { t } from '@/i18n';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Entry {
  id: string;
  foodName: string;
  grams: number;
  meal: MealType;
  snapshot: Nutrition;
}

export default function Diary() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SampleFood | null>(null);
  const [grams, setGrams] = useState('100');
  const [meal, setMeal] = useState<MealType>('breakfast');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SAMPLE_FOODS.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  const totals = useMemo(() => dailyTotals(entries.map((e) => e.snapshot)), [entries]);

  function addEntry() {
    if (!selected) return;
    const g = Number(grams);
    if (Number.isNaN(g) || g <= 0) return;
    const snapshot = entrySnapshot(
      { kcal: selected.kcal, protein: selected.protein, carbs: selected.carbs, fat: selected.fat },
      g,
    );
    setEntries((prev) => [
      ...prev,
      { id: `${selected.id}-${Date.now()}`, foodName: selected.name, grams: g, meal, snapshot },
    ]);
    setSelected(null);
    setGrams('100');
    setQuery('');
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('diary.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Denní souhrn */}
        <View style={s.summary}>
          <Text style={s.summaryLabel}>{t('diary.summary')}</Text>
          <Text style={s.summaryKcal}>
            {totals.kcal} <Text style={s.summaryUnit}>{t('goal.unitKcal')}</Text>
          </Text>
          <View style={s.macroRow}>
            <Macro label={t('goal.protein')} value={totals.protein} c={colors} />
            <Macro label={t('goal.carbs')} value={totals.carbs} c={colors} />
            <Macro label={t('goal.fat')} value={totals.fat} c={colors} />
          </View>
        </View>

        {/* Vyhledávání */}
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setSelected(null);
          }}
          placeholder={t('diary.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={s.search}
        />

        {query.trim().length > 0 && results.length === 0 && !selected && (
          <Text style={s.muted}>{t('diary.noResults')}</Text>
        )}

        {!selected &&
          results.map((f) => (
            <Pressable key={f.id} style={s.resultRow} onPress={() => setSelected(f)}>
              <Text style={s.resultName}>{f.name}</Text>
              <Text style={s.resultKcal}>{f.kcal} {t('goal.unitKcal')}/100 g</Text>
            </Pressable>
          ))}

        {/* Přidání vybrané potraviny */}
        {selected && (
          <View style={s.addCard}>
            <Text style={s.addTitle}>{selected.name}</Text>
            <Text style={s.fieldLabel}>{t('diary.grams')}</Text>
            <TextInput value={grams} onChangeText={setGrams} keyboardType="numeric" style={s.gramsInput} />
            <View style={s.mealRow}>
              {MEALS.map((m) => (
                <Choice key={m} label={t(`meal.${m}`)} active={meal === m} onPress={() => setMeal(m)} c={colors} />
              ))}
            </View>
            <Pressable style={s.addButton} onPress={addEntry}>
              <Text style={s.addButtonText}>{t('diary.add')}</Text>
            </Pressable>
          </View>
        )}

        {/* Záznamy podle jídla */}
        {entries.length === 0 ? (
          <Text style={s.empty}>{t('diary.empty')}</Text>
        ) : (
          MEALS.filter((m) => entries.some((e) => e.meal === m)).map((m) => (
            <View key={m} style={s.mealGroup}>
              <Text style={s.mealHeader}>{t(`meal.${m}`)}</Text>
              {entries
                .filter((e) => e.meal === m)
                .map((e) => (
                  <View key={e.id} style={s.entryRow}>
                    <Text style={s.entryName}>{e.foodName}</Text>
                    <Text style={s.entryMeta}>
                      {e.grams} g · {Math.round(e.snapshot.kcal)} {t('goal.unitKcal')}
                    </Text>
                  </View>
                ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Macro({ label, value, c }: { label: string; value: number; c: ThemeColors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.textFaint, fontSize: fontSize.caption }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold }}>
        {value} {t('goal.unitG')}
      </Text>
    </View>
  );
}

function Choice({ label, active, onPress, c }: { label: string; active: boolean; onPress: () => void; c: ThemeColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{ minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : c.surface }}
    >
      <Text style={{ color: active ? c.onAccent : c.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
    summary: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
    summaryLabel: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium },
    summaryKcal: { color: c.accent, fontSize: 36, fontWeight: fontWeight.bold },
    summaryUnit: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.regular },
    macroRow: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md },
    search: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    resultRow: { minHeight: touchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    resultName: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    resultKcal: { color: c.textFaint, fontSize: fontSize.caption },
    addCard: { backgroundColor: c.surface, borderColor: c.accent, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    addTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    fieldLabel: { color: c.textMuted, fontSize: fontSize.caption },
    gramsInput: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.background, fontSize: fontSize.body },
    mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    addButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    addButtonText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    empty: { color: c.textFaint, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.lg },
    mealGroup: { gap: spacing.xs },
    mealHeader: { color: c.textMuted, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.sm },
    entryRow: { minHeight: touchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    entryName: { color: c.text, fontSize: fontSize.body },
    entryMeta: { color: c.textFaint, fontSize: fontSize.caption },
  });
