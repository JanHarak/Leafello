import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dailyTotals, entrySnapshot, type Nutrition } from '@dietapp/diary';

import { SAMPLE_FOODS } from '@/data/sampleFoods';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addDiaryEntry, createUserFood, listTodayEntries, searchFoods } from '@/lib/db';
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

/** Sjednocený tvar výsledku hledání: hodnoty na 100 g. foodId mají jen potraviny z DB. */
interface Candidate {
  id: string;
  foodId?: string;
  name: string;
  brand?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function Diary() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);

  const { session } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [grams, setGrams] = useState('100');
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [dbError, setDbError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cf, setCf] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [cfError, setCfError] = useState<string | null>(null);

  async function reload() {
    const rows = await listTodayEntries();
    setEntries(
      rows.map((r) => ({
        id: r.id,
        foodName: r.snapshot.name,
        grams: r.grams,
        meal: r.meal,
        snapshot: {
          kcal: r.snapshot.kcal,
          protein: r.snapshot.protein,
          carbs: r.snapshot.carbs,
          fat: r.snapshot.fat,
          fiber: 0,
        },
      })),
    );
  }

  // Přihlášený uživatel: načti dnešní záznamy z DB. Odhlášený: lokální stav.
  useEffect(() => {
    if (session) {
      reload().catch((e) => {
        console.error('Načtení deníku selhalo:', e);
        setDbError(e instanceof Error ? e.message : String(e));
      });
    } else {
      setEntries([]);
    }
  }, [session]);

  // Hledání: přihlášený uživatel v DB (F-04, s debounce), odhlášený v ukázkách.
  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    if (!session) {
      const ql = q.toLowerCase();
      setResults(
        SAMPLE_FOODS.filter((f) => f.name.toLowerCase().includes(ql))
          .slice(0, 8)
          .map((f) => ({ id: f.id, name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat })),
      );
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchFoods(q, 20);
        if (cancelled) return;
        setResults(
          rows.map((r) => ({
            id: r.id,
            foodId: r.id,
            name: r.name,
            brand: r.brand,
            kcal: r.kcal_100g,
            protein: r.protein_100g,
            carbs: r.carbs_100g,
            fat: r.fat_100g,
          })),
        );
      } catch (e) {
        if (!cancelled) {
          console.error('Hledání potravin selhalo:', e);
          setDbError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected, session]);

  const totals = useMemo(() => dailyTotals(entries.map((e) => e.snapshot)), [entries]);

  async function addEntry() {
    if (!selected) return;
    const g = Number(grams);
    if (Number.isNaN(g) || g <= 0) return;
    const snapshot = entrySnapshot(
      { kcal: selected.kcal, protein: selected.protein, carbs: selected.carbs, fat: selected.fat },
      g,
    );
    if (session) {
      try {
        await addDiaryEntry(
          session.user.id,
          meal,
          g,
          {
            name: selected.name,
            kcal: snapshot.kcal,
            protein: snapshot.protein,
            carbs: snapshot.carbs,
            fat: snapshot.fat,
          },
          selected.foodId,
        );
        await reload();
        setDbError(null);
      } catch (e) {
        console.error('Zápis do deníku selhal:', e);
        setDbError(e instanceof Error ? e.message : String(e));
      }
    } else {
      setEntries((prev) => [
        ...prev,
        { id: `${selected.id}-${Date.now()}`, foodName: selected.name, grams: g, meal, snapshot },
      ]);
    }
    setSelected(null);
    setGrams('100');
    setQuery('');
  }

  function openCreate() {
    setCf({ name: query.trim(), kcal: '', protein: '', carbs: '', fat: '' });
    setCfError(null);
    setCreating(true);
  }

  async function saveCustomFood() {
    if (!session) return;
    const name = cf.name.trim();
    if (name === '') {
      setCfError(t('food.errorName'));
      return;
    }
    const kcal = Number(cf.kcal);
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 900) {
      setCfError(t('food.errorKcal'));
      return;
    }
    const num = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    try {
      const food = await createUserFood(session.user.id, {
        name,
        kcal_100g: kcal,
        protein_100g: num(cf.protein),
        carbs_100g: num(cf.carbs),
        fat_100g: num(cf.fat),
      });
      // Rovnou ji vyber pro zápis (gramáž + jídlo).
      setSelected({
        id: food.id,
        foodId: food.id,
        name: food.name,
        brand: food.brand,
        kcal: food.kcal_100g,
        protein: food.protein_100g,
        carbs: food.carbs_100g,
        fat: food.fat_100g,
      });
      setCreating(false);
      setCfError(null);
      setDbError(null);
    } catch (e) {
      console.error('Vytvoření potraviny selhalo:', e);
      setCfError(e instanceof Error ? e.message : String(e));
    }
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

        {dbError && <Text style={s.error}>{dbError}</Text>}

        {searching && <Text style={s.muted}>{t('diary.searching')}</Text>}

        {query.trim().length >= 2 && !searching && results.length === 0 && !selected && (
          <Text style={s.muted}>{t('diary.noResults')}</Text>
        )}

        {!selected &&
          results.map((f) => (
            <Pressable key={f.id} style={s.resultRow} onPress={() => setSelected(f)}>
              <View style={s.resultInfo}>
                <Text style={s.resultName} numberOfLines={1}>{f.name}</Text>
                {f.brand ? <Text style={s.resultBrand} numberOfLines={1}>{f.brand}</Text> : null}
              </View>
              <Text style={s.resultKcal}>{Math.round(f.kcal)} {t('goal.unitKcal')}/100 g</Text>
            </Pressable>
          ))}

        {/* Vlastní potravina (F-03): nabídka, když je co hledat a nic není vybrané */}
        {session && !selected && !creating && !searching && query.trim().length >= 2 && (
          <Pressable style={s.createPrompt} onPress={openCreate}>
            <Text style={s.createPromptText}>+ {t('food.create')}</Text>
          </Pressable>
        )}

        {creating && (
          <View style={s.addCard}>
            <Text style={s.addTitle}>{t('food.title')}</Text>
            <TextInput
              value={cf.name}
              onChangeText={(v) => setCf((p) => ({ ...p, name: v }))}
              placeholder={t('recipes.name')}
              placeholderTextColor={colors.textFaint}
              style={s.gramsInput}
            />
            <Text style={s.fieldLabel}>{t('food.per100')}</Text>
            <View style={s.cfGrid}>
              <CfField label={t('goal.kcal')} value={cf.kcal} onChange={(v) => setCf((p) => ({ ...p, kcal: v }))} c={colors} />
              <CfField label={t('goal.protein')} value={cf.protein} onChange={(v) => setCf((p) => ({ ...p, protein: v }))} c={colors} />
              <CfField label={t('goal.carbs')} value={cf.carbs} onChange={(v) => setCf((p) => ({ ...p, carbs: v }))} c={colors} />
              <CfField label={t('goal.fat')} value={cf.fat} onChange={(v) => setCf((p) => ({ ...p, fat: v }))} c={colors} />
            </View>
            {cfError && <Text style={s.error}>{cfError}</Text>}
            <View style={s.cfActions}>
              <Pressable style={[s.addButton, s.cfFlex]} onPress={saveCustomFood}>
                <Text style={s.addButtonText}>{t('food.save')}</Text>
              </Pressable>
              <Pressable style={[s.cancelButton, s.cfFlex]} onPress={() => setCreating(false)}>
                <Text style={s.cancelText}>{t('account.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        )}

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

function CfField({ label, value, onChange, c }: { label: string; value: string; onChange: (v: string) => void; c: ThemeColors }) {
  return (
    <View style={{ flex: 1, minWidth: 68, gap: spacing.xs }}>
      <Text style={{ color: c.textFaint, fontSize: fontSize.caption }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={c.textFaint}
        style={{ minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.background, fontSize: fontSize.body }}
      />
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
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
    resultRow: { minHeight: touchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    resultInfo: { flex: 1 },
    resultName: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    resultBrand: { color: c.textFaint, fontSize: fontSize.caption },
    resultKcal: { color: c.textFaint, fontSize: fontSize.caption, flexShrink: 0 },
    createPrompt: { minHeight: touchTarget, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    createPromptText: { color: c.accent, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    cfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cfActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    cfFlex: { flex: 1 },
    cancelButton: { minHeight: touchTarget, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    cancelText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
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
