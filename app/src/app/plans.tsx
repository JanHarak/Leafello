import Feather from '@expo/vector-icons/Feather';
import { recipePerPortion } from '@dietapp/diary';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  addDiaryEntry,
  addMealPlanItem,
  createMealPlan,
  createUserFood,
  deleteMealPlan,
  deleteMealPlanItem,
  getMealPlanItems,
  listMealPlans,
  listRecipes,
  searchFoods,
  suggestDay,
  type DaySuggestion,
  type MealPlanItem,
  type MealPlanRow,
  type SavedRecipe,
} from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface FoodCandidate {
  id: string;
  name: string;
  brand?: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let d = s; d <= e; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(d);
  } catch {
    return iso.slice(5);
  }
}

/** Výživa jedné položky plánu (celková porce, ne na 100 g). */
function itemNutrition(item: MealPlanItem, recipes: Map<string, SavedRecipe>) {
  if (item.foodId && item.kcal_100g != null) {
    const f = (item.grams ?? 0) / 100;
    return {
      grams: item.grams ?? 0,
      kcal: item.kcal_100g * f,
      protein: (item.protein_100g ?? 0) * f,
      carbs: (item.carbs_100g ?? 0) * f,
      fat: (item.fat_100g ?? 0) * f,
    };
  }
  if (item.recipeId) {
    const r = recipes.get(item.recipeId);
    if (!r) return null;
    const per = recipePerPortion(
      r.ingredients.map((i) => ({
        per100g: { kcal: i.kcal_100g, protein: i.protein_100g, carbs: i.carbs_100g, fat: i.fat_100g },
        grams: i.grams,
      })),
      Math.max(1, r.servings),
    );
    const portions = item.servings ?? 1;
    const totalGrams = r.ingredients.reduce((sum, i) => sum + i.grams, 0);
    const gramsPerPortion = Math.round((totalGrams / Math.max(1, r.servings)) * 10) / 10;
    return {
      grams: gramsPerPortion * portions,
      kcal: per.kcal * portions,
      protein: per.protein * portions,
      carbs: per.carbs * portions,
      fat: per.fat * portions,
    };
  }
  return null;
}

export default function Plans() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();

  const [plans, setPlans] = useState<MealPlanRow[]>([]);
  const [plan, setPlan] = useState<MealPlanRow | null>(null);
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [recipes, setRecipes] = useState<Map<string, SavedRecipe>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Tvorba plánu
  const [cpName, setCpName] = useState('');
  const [cpStart, setCpStart] = useState(todayIso());
  const [cpWeeks, setCpWeeks] = useState('1');

  // Detail plánu
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addMeal, setAddMeal] = useState<MealType>('breakfast');
  const [addMode, setAddMode] = useState<'food' | 'recipe'>('food');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodCandidate[]>([]);
  const [selFood, setSelFood] = useState<FoodCandidate | null>(null);
  const [addGrams, setAddGrams] = useState('100');
  const [selRecipe, setSelRecipe] = useState<SavedRecipe | null>(null);
  const [addServings, setAddServings] = useState('1');
  const [transferredMsg, setTransferredMsg] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<DaySuggestion | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [allergies, setAllergies] = useState('');
  const [available, setAvailable] = useState('');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const loadPlans = useCallback(() => {
    if (!session) {
      setPlans([]);
      return;
    }
    Promise.all([listMealPlans(), listRecipes()])
      .then(([pls, recs]) => {
        setPlans(pls);
        setRecipes(new Map(recs.map((r) => [r.id, r])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [session]);

  useFocusEffect(loadPlans);

  const loadItems = useCallback((planId: string) => {
    getMealPlanItems(planId)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function openPlan(p: MealPlanRow) {
    setPlan(p);
    setSelectedDate(p.start_date);
    setItems([]);
    setTransferredMsg(null);
    loadItems(p.id);
  }

  // Hledání potravin (debounce), jen pro režim food.
  useEffect(() => {
    const q = query.trim();
    if (addMode !== 'food' || selFood || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchFoods(q, 20);
        if (!cancelled) setResults(rows.map((r) => ({ id: r.id, name: r.name, brand: r.brand, kcal_100g: r.kcal_100g, protein_100g: r.protein_100g, carbs_100g: r.carbs_100g, fat_100g: r.fat_100g })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selFood, addMode]);

  async function onCreatePlan() {
    if (!session) return;
    if (cpName.trim() === '') {
      setError(t('plans.errorName'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cpStart)) {
      setError(t('plans.errorDate'));
      return;
    }
    try {
      const id = await createMealPlan(session.user.id, cpName, cpStart, Number(cpWeeks) || 1);
      setCpName('');
      setError(null);
      loadPlans();
      openPlan({ id, name: cpName.trim(), start_date: cpStart, end_date: '' });
      // Načti kompletní řádek (kvůli end_date) ze seznamu po refetchi.
      const fresh = await listMealPlans();
      const created = fresh.find((p) => p.id === id);
      if (created) setPlan(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onAddItem() {
    if (!plan || !selectedDate) return;
    try {
      if (addMode === 'food') {
        if (!selFood) return;
        const g = Number(addGrams);
        if (!Number.isFinite(g) || g <= 0) return;
        await addMealPlanItem(plan.id, { planDate: selectedDate, meal: addMeal, foodId: selFood.id, grams: g });
      } else {
        if (!selRecipe) return;
        const sv = Number(addServings);
        if (!Number.isFinite(sv) || sv <= 0) return;
        await addMealPlanItem(plan.id, { planDate: selectedDate, meal: addMeal, recipeId: selRecipe.id, servings: sv });
      }
      setSelFood(null);
      setSelRecipe(null);
      setQuery('');
      setAddGrams('100');
      setAddServings('1');
      setTransferredMsg(null);
      loadItems(plan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRemoveItem(id: string) {
    if (!plan) return;
    try {
      await deleteMealPlanItem(id);
      loadItems(plan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDeletePlan(id: string) {
    try {
      await deleteMealPlan(id);
      if (plan?.id === id) setPlan(null);
      loadPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // F-12: přenos dne do deníku jen na tlačítko, nikdy automaticky.
  async function transferDay(date: string) {
    if (!session || !plan) return;
    const dayItems = items.filter((i) => i.planDate === date);
    try {
      for (const it of dayItems) {
        const n = itemNutrition(it, recipes);
        if (!n) continue;
        await addDiaryEntry(
          session.user.id,
          it.meal,
          Math.round(n.grams * 10) / 10,
          { name: it.name, kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat },
          it.foodId ?? undefined,
          it.recipeId ?? undefined,
        );
      }
      setTransferredMsg(date);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSuggest() {
    if (!plan || suggestBusy) return;
    setSuggestBusy(true);
    setSuggestion(null);
    setDeselected(new Set());
    setError(null);
    try {
      setSuggestion(await suggestDay({ allergies, available }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'no_goal' ? t('plans.aiNeedGoal') : t('plans.aiError'));
    } finally {
      setSuggestBusy(false);
    }
  }

  const itemKey = (mi: number, ii: number) => `${mi}-${ii}`;
  function toggleItem(mi: number, ii: number) {
    setDeselected((prev) => {
      const next = new Set(prev);
      const k = itemKey(mi, ii);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  // Vloží AI návrh do vybraného dne: každou položku uloží jako vlastní
  // potravinu a přidá do plánu. Nic se neděje bez tohoto potvrzení.
  async function applySuggestion() {
    if (!session || !plan || !selectedDate || !suggestion) return;
    try {
      for (let mi = 0; mi < suggestion.meals.length; mi += 1) {
        const m = suggestion.meals[mi];
        for (let ii = 0; ii < m.items.length; ii += 1) {
          if (deselected.has(itemKey(mi, ii))) continue;
          const it = m.items[ii];
          const food = await createUserFood(session.user.id, {
            name: it.name,
            kcal_100g: it.kcal_100g,
            protein_100g: it.protein_100g,
            carbs_100g: it.carbs_100g,
            fat_100g: it.fat_100g,
          });
          await addMealPlanItem(plan.id, { planDate: selectedDate, meal: m.meal, foodId: food.id, grams: it.grams });
        }
      }
      setSuggestion(null);
      loadItems(plan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!session ? (
          <Text style={s.muted}>{t('plans.needSignIn')}</Text>
        ) : !plan ? (
          <>
            {/* Vysvětlení sekce */}
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('plans.aboutTitle')}</Text>
              <Text style={s.aboutBody}>{t('plans.aboutBody')}</Text>
            </View>

            {/* Tvorba plánu */}
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('plans.newPlan')}</Text>
              <TextInput value={cpName} onChangeText={setCpName} placeholder={t('plans.planName')} placeholderTextColor={colors.textFaint} style={s.input} />
              <Text style={s.fieldLabel}>{t('plans.startDate')}</Text>
              <TextInput value={cpStart} onChangeText={setCpStart} placeholder="RRRR-MM-DD" placeholderTextColor={colors.textFaint} autoCapitalize="none" style={s.input} />
              <Text style={s.fieldLabel}>{t('plans.weeks')}</Text>
              <View style={s.weeksRow}>
                {[1, 2, 3, 4].map((w) => (
                  <Pressable key={w} onPress={() => setCpWeeks(String(w))} style={[s.weekChip, { backgroundColor: cpWeeks === String(w) ? colors.accent : colors.surface, borderColor: cpWeeks === String(w) ? colors.accent : colors.border }]}>
                    <Text style={{ color: cpWeeks === String(w) ? colors.onAccent : colors.text, fontWeight: fontWeight.medium }}>{w}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={s.primary} onPress={onCreatePlan}>
                <Text style={s.primaryText}>{t('plans.create')}</Text>
              </Pressable>
            </View>

            {plans.length === 0 ? (
              <Text style={s.muted}>{t('plans.empty')}</Text>
            ) : (
              plans.map((p) => (
                <Pressable key={p.id} style={s.planRow} onPress={() => openPlan(p)}>
                  <View style={s.resultInfo}>
                    <Text style={s.resultName}>{p.name}</Text>
                    <Text style={s.resultBrand}>{p.start_date} – {p.end_date}</Text>
                  </View>
                  <Pressable onPress={() => onDeletePlan(p.id)} accessibilityRole="button" hitSlop={8}>
                    <Text style={s.remove}>×</Text>
                  </Pressable>
                </Pressable>
              ))
            )}
            {error && <Text style={s.error}>{error}</Text>}
          </>
        ) : (
          <>
            <Pressable onPress={() => setPlan(null)} accessibilityRole="button">
              <Text style={s.back}>‹ {t('plans.back')}</Text>
            </Pressable>
            <Text style={s.planTitle}>{plan.name}</Text>

            {/* Výběr dne */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayScroll}>
              {plan.end_date
                ? dateRange(plan.start_date, plan.end_date).map((d) => {
                    const active = d === selectedDate;
                    const count = items.filter((i) => i.planDate === d).length;
                    return (
                      <Pressable key={d} onPress={() => { setSelectedDate(d); setTransferredMsg(null); }} style={[s.dayChip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}>
                        <Text style={{ color: active ? colors.onAccent : colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{fmtDay(d)}</Text>
                        {count > 0 && <Text style={{ color: active ? colors.onAccent : colors.textFaint, fontSize: fontSize.caption }}>{count}</Text>}
                      </Pressable>
                    );
                  })
                : null}
            </ScrollView>

            {selectedDate && (
              <>
                {/* Položky dne po jídlech */}
                {(() => {
                  const dayItems = items.filter((i) => i.planDate === selectedDate);
                  const dayKcal = dayItems.reduce((sum, it) => sum + (itemNutrition(it, recipes)?.kcal ?? 0), 0);
                  return (
                    <>
                      <View style={s.dayHeader}>
                        <Text style={s.section}>{fmtDay(selectedDate)}</Text>
                        <Text style={s.dayKcal}>{Math.round(dayKcal)} {t('goal.unitKcal')}</Text>
                      </View>
                      {dayItems.length === 0 && <Text style={s.muted}>{t('plans.noItems')}</Text>}
                      {MEALS.filter((m) => dayItems.some((i) => i.meal === m)).map((m) => (
                        <View key={m} style={s.mealGroup}>
                          <Text style={s.mealHeader}>{t(`meal.${m}`)}</Text>
                          {dayItems.filter((i) => i.meal === m).map((it) => {
                            const n = itemNutrition(it, recipes);
                            return (
                              <View key={it.id} style={s.itemRow}>
                                <View style={s.resultInfo}>
                                  <Text style={s.itemName} numberOfLines={1}>{it.name}</Text>
                                  <Text style={s.itemMeta}>
                                    {it.foodId ? `${it.grams} g` : `${it.servings}× ${t('recipes.perPortion').toLowerCase()}`}
                                    {n ? ` · ${Math.round(n.kcal)} ${t('goal.unitKcal')}` : ''}
                                  </Text>
                                </View>
                                <Pressable onPress={() => onRemoveItem(it.id)} accessibilityRole="button" hitSlop={8}>
                                  <Text style={s.remove}>×</Text>
                                </Pressable>
                              </View>
                            );
                          })}
                        </View>
                      ))}

                      {dayItems.length > 0 && (
                        <>
                          <Pressable style={s.transfer} onPress={() => transferDay(selectedDate)}>
                            <Text style={s.transferText}>{t('plans.transferDay')}</Text>
                          </Pressable>
                          {transferredMsg === selectedDate && <Text style={s.logged}>{t('plans.transferred')}</Text>}
                        </>
                      )}
                    </>
                  );
                })()}

                {/* AI návrh jídelníčku na den */}
                <View style={s.card}>
                  <Text style={s.cardTitle}>{t('plans.aiTitle')}</Text>
                  <TextInput value={allergies} onChangeText={setAllergies} placeholder={t('plans.allergies')} placeholderTextColor={colors.textFaint} style={s.input} />
                  <TextInput value={available} onChangeText={setAvailable} placeholder={t('plans.available')} placeholderTextColor={colors.textFaint} style={s.input} />
                  <Pressable style={[s.primary, suggestBusy && { opacity: 0.6 }]} onPress={onSuggest} disabled={suggestBusy}>
                    <Text style={s.primaryText}>{suggestBusy ? t('plans.aiBusy') : suggestion ? t('plans.aiRegenerate') : t('plans.aiSuggest')}</Text>
                  </Pressable>
                  {suggestion && (
                    <View style={s.suggestBox}>
                      <Text style={s.muted}>{t('plans.aiHint')}</Text>
                      {suggestion.meals.map((m, mi) => (
                        <View key={mi} style={s.mealGroup}>
                          <Text style={s.mealHeader}>{t(`meal.${m.meal}`)}</Text>
                          {m.items.map((it, ii) => {
                            const off = deselected.has(itemKey(mi, ii));
                            return (
                              <Pressable key={ii} style={s.suggestItem} onPress={() => toggleItem(mi, ii)} accessibilityRole="checkbox" accessibilityState={{ checked: !off }}>
                                <Feather name={off ? 'square' : 'check-square'} size={20} color={off ? colors.textFaint : colors.accent} />
                                <Text style={[s.itemMeta, off && s.itemOff]} numberOfLines={1}>
                                  {it.name} · {it.grams} g · {Math.round((it.kcal_100g * it.grams) / 100)} {t('goal.unitKcal')}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                      {suggestion.notes ? <Text style={s.muted}>{suggestion.notes}</Text> : null}
                      <Pressable style={s.transfer} onPress={applySuggestion}>
                        <Text style={s.transferText}>{t('plans.aiApply')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Přidání položky */}
                <View style={s.card}>
                  <Text style={s.cardTitle}>{t('plans.addItem')}</Text>
                  <View style={s.mealRow}>
                    {MEALS.map((m) => (
                      <Pressable key={m} onPress={() => setAddMeal(m)} style={[s.mealChip, { backgroundColor: addMeal === m ? colors.accent : colors.surface, borderColor: addMeal === m ? colors.accent : colors.border }]}>
                        <Text style={{ color: addMeal === m ? colors.onAccent : colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{t(`meal.${m}`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.modeRow}>
                    <Pressable style={[s.modeChip, { backgroundColor: addMode === 'food' ? colors.accent : colors.surface, borderColor: addMode === 'food' ? colors.accent : colors.border }]} onPress={() => { setAddMode('food'); setSelRecipe(null); }}>
                      <Text style={{ color: addMode === 'food' ? colors.onAccent : colors.text, fontWeight: fontWeight.medium }}>{t('plans.food')}</Text>
                    </Pressable>
                    <Pressable style={[s.modeChip, { backgroundColor: addMode === 'recipe' ? colors.accent : colors.surface, borderColor: addMode === 'recipe' ? colors.accent : colors.border }]} onPress={() => { setAddMode('recipe'); setSelFood(null); setQuery(''); }}>
                      <Text style={{ color: addMode === 'recipe' ? colors.onAccent : colors.text, fontWeight: fontWeight.medium }}>{t('plans.recipe')}</Text>
                    </Pressable>
                  </View>

                  {addMode === 'food' ? (
                    selFood ? (
                      <View style={s.selRow}>
                        <Text style={s.itemName}>{selFood.name}</Text>
                        <View style={s.gramsRow}>
                          <TextInput value={addGrams} onChangeText={setAddGrams} keyboardType="numeric" style={s.gramsInput} />
                          <Text style={s.gramsUnit}>g</Text>
                        </View>
                        <Pressable style={s.primary} onPress={onAddItem}><Text style={s.primaryText}>{t('plans.addItem')}</Text></Pressable>
                        <Pressable onPress={() => setSelFood(null)}><Text style={s.clear}>{t('account.cancel')}</Text></Pressable>
                      </View>
                    ) : (
                      <>
                        <TextInput value={query} onChangeText={setQuery} placeholder={t('diary.searchPlaceholder')} placeholderTextColor={colors.textFaint} style={s.input} />
                        {results.map((f) => (
                          <Pressable key={f.id} style={s.resultRow} onPress={() => setSelFood(f)}>
                            <View style={s.resultInfo}>
                              <Text style={s.resultName} numberOfLines={1}>{f.name}</Text>
                              {f.brand ? <Text style={s.resultBrand} numberOfLines={1}>{f.brand}</Text> : null}
                            </View>
                            <Text style={s.resultKcal}>{Math.round(f.kcal_100g)} {t('goal.unitKcal')}/100 g</Text>
                          </Pressable>
                        ))}
                      </>
                    )
                  ) : selRecipe ? (
                    <View style={s.selRow}>
                      <Text style={s.itemName}>{selRecipe.name}</Text>
                      <View style={s.gramsRow}>
                        <TextInput value={addServings} onChangeText={setAddServings} keyboardType="numeric" style={s.gramsInput} />
                        <Text style={s.gramsUnit}>×</Text>
                      </View>
                      <Pressable style={s.primary} onPress={onAddItem}><Text style={s.primaryText}>{t('plans.addItem')}</Text></Pressable>
                      <Pressable onPress={() => setSelRecipe(null)}><Text style={s.clear}>{t('account.cancel')}</Text></Pressable>
                    </View>
                  ) : recipes.size === 0 ? (
                    <Text style={s.muted}>{t('recipes.empty')}</Text>
                  ) : (
                    [...recipes.values()].map((r) => (
                      <Pressable key={r.id} style={s.resultRow} onPress={() => setSelRecipe(r)}>
                        <Text style={s.resultName} numberOfLines={1}>{r.name}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              </>
            )}
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
    content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl },
    muted: { color: c.textFaint, fontSize: fontSize.body, marginTop: spacing.sm },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.sm },
    cardTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    aboutBody: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    suggestBox: { gap: spacing.sm, marginTop: spacing.sm },
    suggestItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, paddingVertical: spacing.xs },
    itemOff: { textDecorationLine: 'line-through', color: c.textFaint },
    input: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    fieldLabel: { color: c.textMuted, fontSize: fontSize.caption },
    weeksRow: { flexDirection: 'row', gap: spacing.sm },
    weekChip: { minWidth: touchTarget, minHeight: touchTarget, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    primary: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
    primaryText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    planRow: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    resultInfo: { flex: 1 },
    resultName: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    resultBrand: { color: c.textFaint, fontSize: fontSize.caption },
    resultKcal: { color: c.textFaint, fontSize: fontSize.caption, flexShrink: 0 },
    back: { color: c.accent, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    planTitle: { color: c.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
    dayScroll: { gap: spacing.sm, paddingVertical: spacing.sm },
    dayChip: { minWidth: 64, minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
    dayKcal: { color: c.accent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    section: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium },
    mealGroup: { gap: spacing.xs, marginTop: spacing.xs },
    mealHeader: { color: c.textMuted, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.xs },
    itemRow: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    itemName: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    itemMeta: { color: c.textFaint, fontSize: fontSize.caption },
    remove: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold, paddingHorizontal: spacing.sm },
    transfer: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
    transferText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    logged: { color: c.accent, fontSize: fontSize.body, marginTop: spacing.xs },
    mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    mealChip: { minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    modeRow: { flexDirection: 'row', gap: spacing.sm },
    modeChip: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    selRow: { gap: spacing.sm },
    gramsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    gramsInput: { width: 90, minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.background, fontSize: fontSize.body },
    gramsUnit: { color: c.textMuted, fontSize: fontSize.body },
    clear: { color: c.textFaint, fontSize: fontSize.caption, paddingVertical: spacing.xs },
    resultRow: { minHeight: touchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body, marginTop: spacing.sm },
  });
