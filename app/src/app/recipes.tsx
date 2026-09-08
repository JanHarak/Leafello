import { recipePerPortion } from '@dietapp/diary';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SAMPLE_FOODS } from '@/data/sampleFoods';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  addDiaryEntry,
  createUserFood,
  deleteRecipe,
  listRecipes,
  saveRecipe,
  searchFoods,
  updateRecipe,
  type SavedRecipe,
} from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Sjednocený tvar potraviny (hodnoty na 100 g). foodId mají jen potraviny z DB. */
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

interface Ingredient {
  food: Candidate;
  grams: number;
}

export default function Recipes() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [servings, setServings] = useState('4');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [addGrams, setAddGrams] = useState('100');
  const [meal, setMeal] = useState<MealType>('lunch');
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uložené recepty
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [currentRecipeId, setCurrentRecipeId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<'created' | 'updated' | null>(null);

  // Vlastní potravina (F-03)
  const [creating, setCreating] = useState(false);
  const [cf, setCf] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [cfError, setCfError] = useState<string | null>(null);

  const loadRecipes = useCallback(() => {
    if (!session) {
      setSaved([]);
      return;
    }
    listRecipes()
      .then(setSaved)
      .catch((e) => {
        console.error('Načtení receptů selhalo:', e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [session]);

  useFocusEffect(loadRecipes);

  // Hledání ingrediencí: přihlášený v DB (F-04, debounce), odhlášený v ukázkách.
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
          setError(e instanceof Error ? e.message : String(e));
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

  // Úprava jen zruší hlášky; vazba na uložený recept (currentRecipeId) zůstává,
  // takže „Uložit změny" ho přepíše. Nový recept se založí přes „Nový recept".
  function markDirty() {
    setLogged(false);
    setSavedMsg(null);
  }

  function addIngredient() {
    if (!selected) return;
    const g = Number(addGrams);
    if (Number.isNaN(g) || g <= 0) return;
    setIngredients((prev) => [...prev, { food: selected, grams: g }]);
    setSelected(null);
    setAddGrams('100');
    setQuery('');
    markDirty();
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  function openCreate() {
    setCf({ name: query.trim(), kcal: '', protein: '', carbs: '', fat: '' });
    setCfError(null);
    setCreating(true);
  }

  async function saveCustomFood() {
    if (!session) return;
    const nm = cf.name.trim();
    if (nm === '') {
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
        name: nm,
        kcal_100g: kcal,
        protein_100g: num(cf.protein),
        carbs_100g: num(cf.carbs),
        fat_100g: num(cf.fat),
      });
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
    } catch (e) {
      console.error('Vytvoření potraviny selhalo:', e);
      setCfError(e instanceof Error ? e.message : String(e));
    }
  }

  function loadSavedRecipe(r: SavedRecipe) {
    setName(r.name);
    setServings(String(r.servings));
    setIngredients(
      r.ingredients.map((i) => ({
        grams: i.grams,
        food: {
          id: i.foodId,
          foodId: i.foodId,
          name: i.name,
          kcal: i.kcal_100g,
          protein: i.protein_100g,
          carbs: i.carbs_100g,
          fat: i.fat_100g,
        },
      })),
    );
    setSelected(null);
    setQuery('');
    setCurrentRecipeId(r.id);
    setLogged(false);
    setSavedMsg(null);
  }

  function newRecipe() {
    setName('');
    setServings('4');
    setIngredients([]);
    setSelected(null);
    setQuery('');
    setCurrentRecipeId(null);
    setLogged(false);
    setSavedMsg(null);
  }

  const canSave = !!session && name.trim() !== '' && ingredients.length > 0 && ingredients.every((i) => !!i.food.foodId);

  async function saveCurrentRecipe() {
    if (!session) return;
    if (name.trim() === '') {
      setError(t('recipes.errorName'));
      return;
    }
    if (!ingredients.every((i) => i.food.foodId)) return;
    try {
      const id = await saveRecipe(
        session.user.id,
        name,
        servingsNum,
        ingredients.map((i) => ({ foodId: i.food.foodId as string, grams: i.grams })),
      );
      setCurrentRecipeId(id);
      setSavedMsg('created');
      setError(null);
      loadRecipes();
    } catch (e) {
      console.error('Uložení receptu selhalo:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function updateCurrentRecipe() {
    if (!session || !currentRecipeId) return;
    if (name.trim() === '') {
      setError(t('recipes.errorName'));
      return;
    }
    if (!ingredients.every((i) => i.food.foodId)) return;
    try {
      await updateRecipe(
        currentRecipeId,
        name,
        servingsNum,
        ingredients.map((i) => ({ foodId: i.food.foodId as string, grams: i.grams })),
      );
      setSavedMsg('updated');
      setError(null);
      loadRecipes();
    } catch (e) {
      console.error('Úprava receptu selhala:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeSavedRecipe(id: string) {
    try {
      await deleteRecipe(id);
      if (currentRecipeId === id) setCurrentRecipeId(null);
      loadRecipes();
    } catch (e) {
      console.error('Smazání receptu selhalo:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function logPortion() {
    if (!session || !perPortion) return;
    const totalGrams = ingredients.reduce((sum, i) => sum + i.grams, 0);
    const portionGrams = Math.round((totalGrams / servingsNum) * 10) / 10;
    try {
      await addDiaryEntry(
        session.user.id,
        meal,
        portionGrams,
        {
          name: name.trim() || t('recipes.title'),
          kcal: perPortion.kcal,
          protein: perPortion.protein,
          carbs: perPortion.carbs,
          fat: perPortion.fat,
        },
        undefined,
        currentRecipeId ?? undefined,
      );
      setLogged(true);
      setError(null);
    } catch (e) {
      console.error('Zápis receptu selhal:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Uložené recepty */}
        {saved.length > 0 && (
          <>
            <View style={s.savedHeader}>
              <Text style={s.section}>{t('recipes.savedList')}</Text>
              <Pressable onPress={newRecipe} accessibilityRole="button">
                <Text style={s.newLink}>+ {t('recipes.newRecipe')}</Text>
              </Pressable>
            </View>
            {saved.map((r) => (
              <Pressable key={r.id} style={s.savedRow} onPress={() => loadSavedRecipe(r)}>
                <View style={s.resultInfo}>
                  <Text style={s.resultName} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.resultBrand}>
                    {r.servings} {t('recipes.servings').toLowerCase()} · {r.ingredients.length}
                  </Text>
                </View>
                <Pressable onPress={() => removeSavedRecipe(r.id)} accessibilityRole="button" hitSlop={8}>
                  <Text style={s.remove}>×</Text>
                </Pressable>
              </Pressable>
            ))}
          </>
        )}

        <TextInput value={name} onChangeText={(v) => { setName(v); setSavedMsg(null); }} placeholder={t('recipes.name')} placeholderTextColor={colors.textFaint} style={s.input} />
        <View style={s.servingsRow}>
          <Text style={s.fieldLabel}>{t('recipes.servings')}</Text>
          <TextInput value={servings} onChangeText={(v) => { setServings(v); markDirty(); }} keyboardType="numeric" style={[s.input, s.servingsInput]} />
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
        {searching && <Text style={s.muted}>{t('diary.searching')}</Text>}
        {!selected &&
          !creating &&
          results.map((f) => (
            <Pressable key={f.id} style={s.resultRow} onPress={() => setSelected(f)}>
              <View style={s.resultInfo}>
                <Text style={s.resultName} numberOfLines={1}>{f.name}</Text>
                {f.brand ? <Text style={s.resultBrand} numberOfLines={1}>{f.brand}</Text> : null}
              </View>
              <Text style={s.resultKcal}>{Math.round(f.kcal)} {t('goal.unitKcal')}/100 g</Text>
            </Pressable>
          ))}

        {/* Vlastní potravina */}
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
              style={s.input}
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
              <>
                <Pressable
                  style={[s.saveButton, !canSave && s.buttonDisabled]}
                  onPress={currentRecipeId ? updateCurrentRecipe : saveCurrentRecipe}
                  disabled={!canSave}
                >
                  <Text style={s.saveText}>{currentRecipeId ? t('recipes.update') : t('recipes.save')}</Text>
                </Pressable>
                {savedMsg && <Text style={s.logged}>{savedMsg === 'updated' ? t('recipes.updated') : t('recipes.saved')}</Text>}
                <Pressable style={s.logButton} onPress={logPortion}>
                  <Text style={s.logText}>{t('recipes.logPortion')}</Text>
                </Pressable>
              </>
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

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl },
    input: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    servingsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    servingsInput: { flex: 1 },
    fieldLabel: { color: c.textMuted, fontSize: fontSize.caption },
    savedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    newLink: { color: c.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
    savedRow: { minHeight: touchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
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
    saveButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    saveText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    buttonDisabled: { opacity: 0.5 },
    logButton: { minHeight: touchTarget, borderWidth: 1, borderColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
    logText: { color: c.accent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    logged: { color: c.accent, fontSize: fontSize.body },
    muted: { color: c.textFaint, fontSize: fontSize.body, marginTop: spacing.md },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
