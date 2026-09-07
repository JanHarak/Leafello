import { recipePerPortion } from '@dietapp/diary';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SAMPLE_FOODS, type SampleFood } from '@/data/sampleFoods';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addDiaryEntry } from '@/lib/db';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Ingredient {
  food: SampleFood;
  grams: number;
}

export default function Recipes() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [servings, setServings] = useState('4');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SampleFood | null>(null);
  const [addGrams, setAddGrams] = useState('100');
  const [meal, setMeal] = useState<MealType>('lunch');
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SAMPLE_FOODS.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  const servingsNum = Math.max(1, Number(servings) || 1);
  const perPortion = useMemo(() => {
    if (ingredients.length === 0) return null;
    return recipePerPortion(
      ingredients.map((i) => ({
        per100g: { kcal: i.food.kcal, protein: i.food.protein, carbs: i.food.carbs, fat: i.food.fat },
        grams: i.grams,
      })),
      servingsNum,
    );
  }, [ingredients, servingsNum]);

  function addIngredient() {
    if (!selected) return;
    const g = Number(addGrams);
    if (Number.isNaN(g) || g <= 0) return;
    setIngredients((prev) => [...prev, { food: selected, grams: g }]);
    setSelected(null);
    setAddGrams('100');
    setQuery('');
    setLogged(false);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
    setLogged(false);
  }

  async function logPortion() {
    if (!session || !perPortion) return;
    const totalGrams = ingredients.reduce((sum, i) => sum + i.grams, 0);
    const portionGrams = Math.round((totalGrams / servingsNum) * 10) / 10;
    try {
      await addDiaryEntry(session.user.id, meal, portionGrams, {
        name: name.trim() || t('recipes.title'),
        kcal: perPortion.kcal,
        protein: perPortion.protein,
        carbs: perPortion.carbs,
        fat: perPortion.fat,
      });
      setLogged(true);
      setError(null);
    } catch (e) {
      console.error('Zápis receptu selhal:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('recipes.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextInput value={name} onChangeText={setName} placeholder={t('recipes.name')} placeholderTextColor={colors.textFaint} style={s.input} />
        <View style={s.servingsRow}>
          <Text style={s.fieldLabel}>{t('recipes.servings')}</Text>
          <TextInput value={servings} onChangeText={setServings} keyboardType="numeric" style={[s.input, s.servingsInput]} />
        </View>

        {/* Vyhledání a přidání ingredience */}
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setSelected(null);
          }}
          placeholder={t('diary.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={s.input}
        />
        {!selected &&
          results.map((f) => (
            <Pressable key={f.id} style={s.resultRow} onPress={() => setSelected(f)}>
              <Text style={s.resultName}>{f.name}</Text>
              <Text style={s.resultKcal}>{f.kcal} {t('goal.unitKcal')}/100 g</Text>
            </Pressable>
          ))}
        {selected && (
          <View style={s.addCard}>
            <Text style={s.addTitle}>{selected.name}</Text>
            <Text style={s.fieldLabel}>{t('diary.grams')}</Text>
            <TextInput value={addGrams} onChangeText={setAddGrams} keyboardType="numeric" style={s.input} />
            <Pressable style={s.addButton} onPress={addIngredient}>
              <Text style={s.addButtonText}>{t('recipes.ingredients')} +</Text>
            </Pressable>
          </View>
        )}

        {/* Seznam ingrediencí */}
        {ingredients.length > 0 && <Text style={s.section}>{t('recipes.ingredients')}</Text>}
        {ingredients.map((ing, idx) => (
          <View key={`${ing.food.id}-${idx}`} style={s.ingRow}>
            <Text style={s.ingName}>{ing.food.name}</Text>
            <View style={s.ingRight}>
              <Text style={s.ingGrams}>{ing.grams} g</Text>
              <Pressable onPress={() => removeIngredient(idx)} accessibilityRole="button">
                <Text style={s.remove}>×</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Výživa na porci */}
        {perPortion ? (
          <View style={s.card}>
            <Text style={s.label}>{t('recipes.perPortion')}</Text>
            <Text style={s.kcal}>
              {Math.round(perPortion.kcal)} <Text style={s.unit}>{t('goal.unitKcal')}</Text>
            </Text>
            <Text style={s.macros}>
              {t('goal.protein')} {Math.round(perPortion.protein)} {t('goal.unitG')} · {t('goal.carbs')} {Math.round(perPortion.carbs)} {t('goal.unitG')} · {t('goal.fat')} {Math.round(perPortion.fat)} {t('goal.unitG')}
            </Text>

            <View style={s.mealRow}>
              {MEALS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMeal(m)}
                  style={[s.mealChip, { backgroundColor: meal === m ? colors.accent : colors.surface, borderColor: meal === m ? colors.accent : colors.border }]}
                >
                  <Text style={{ color: meal === m ? colors.onAccent : colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{t(`meal.${m}`)}</Text>
                </Pressable>
              ))}
            </View>

            {session && (
              <Pressable style={s.logButton} onPress={logPortion}>
                <Text style={s.logText}>{t('recipes.logPortion')}</Text>
              </Pressable>
            )}
            {logged && <Text style={s.logged}>{t('recipes.logged')}</Text>}
            {error && <Text style={s.error}>{error}</Text>}
          </View>
        ) : (
          <Text style={s.muted}>{t('recipes.empty')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl },
    input: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    servingsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    servingsInput: { flex: 1 },
    fieldLabel: { color: c.textMuted, fontSize: fontSize.caption },
    resultRow: { minHeight: touchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    resultName: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    resultKcal: { color: c.textFaint, fontSize: fontSize.caption },
    addCard: { backgroundColor: c.surface, borderColor: c.accent, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    addTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    addButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    addButtonText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    section: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.md },
    ingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    ingName: { color: c.text, fontSize: fontSize.body },
    ingRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    ingGrams: { color: c.textMuted, fontSize: fontSize.body },
    remove: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold, paddingHorizontal: spacing.sm },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, marginTop: spacing.md },
    label: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium },
    kcal: { color: c.accent, fontSize: 36, fontWeight: fontWeight.bold },
    unit: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.regular },
    macros: { color: c.textMuted, fontSize: fontSize.body },
    mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    mealChip: { minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    logButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    logText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    logged: { color: c.accent, fontSize: fontSize.body },
    muted: { color: c.textFaint, fontSize: fontSize.body, marginTop: spacing.md },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
