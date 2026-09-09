import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { entrySnapshot } from '@dietapp/diary';

import { Loading } from '@/components/Loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addDiaryEntry, saveGeneratedRecipe, suggestRecipes, type SuggestedRecipe } from '@/lib/db';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// Kategorie surovin (české). Slouží jen jako rychlý výběr; uživatel může přidat
// vlastní suroviny volným textem. Klíč se překládá přes recipes.gen.cat.<key>.
const CATEGORIES: { key: string; items: string[] }[] = [
  { key: 'sides', items: ['Rýže', 'Těstoviny', 'Brambory', 'Batáty', 'Kuskus', 'Quinoa', 'Ovesné vločky', 'Pečivo'] },
  { key: 'protein', items: ['Kuřecí prsa', 'Vejce', 'Losos', 'Tuňák', 'Hovězí', 'Tofu', 'Cizrna', 'Čočka'] },
  { key: 'dairy', items: ['Mléko', 'Bílý jogurt', 'Řecký jogurt', 'Tvaroh', 'Cottage', 'Sýr eidam', 'Mozzarella', 'Smetana', 'Máslo'] },
  { key: 'veg', items: ['Rajče', 'Paprika', 'Brokolice', 'Špenát', 'Mrkev', 'Cibule', 'Cuketa', 'Salát'] },
  { key: 'fruit', items: ['Jablko', 'Banán', 'Borůvky', 'Jahody', 'Pomeranč', 'Hruška', 'Avokádo'] },
  { key: 'spices', items: ['Sůl', 'Pepř', 'Česnek', 'Bazalka', 'Oregano', 'Chilli', 'Kurkuma', 'Kmín'] },
];

interface CardStatus {
  logged?: boolean;
  saved?: boolean;
  busy?: 'log' | 'save';
  error?: string;
}

function recipeTotals(r: SuggestedRecipe) {
  return r.ingredients.reduce(
    (acc, it) => {
      const n = entrySnapshot({ kcal: it.kcal_100g, protein: it.protein_100g, carbs: it.carbs_100g, fat: it.fat_100g }, it.grams);
      acc.kcal += n.kcal;
      acc.protein += n.protein;
      acc.carbs += n.carbs;
      acc.fat += n.fat;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function RecipeGenerator({ onSaved }: { onSaved?: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();

  const [meal, setMeal] = useState<MealType>('lunch');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<SuggestedRecipe[] | null>(null);
  const [status, setStatus] = useState<Record<number, CardStatus>>({});
  // Výběr (fáze + suroviny) je sbalitelný; po vygenerování se sbalí, aby byl
  // vidět jen výsledek. Rozbalí se přes šipku v hlavičce.
  const [collapsed, setCollapsed] = useState(false);

  const customCount = custom.split(',').map((x) => x.trim()).filter(Boolean).length;
  const pickedCount = selected.size + customCount;

  // Responzivní mřížka receptů: 3 sloupce na širokém, 2 na středním, 1 na úzkém.
  const { width } = useWindowDimensions();
  const cols = width >= 1200 ? 3 : width >= 820 ? 2 : 1;
  const cardWidth = cols === 1 ? '100%' : cols === 2 ? '48%' : '31.5%';

  function toggle(item: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  function chosenIngredients(): string {
    const customList = custom.split(',').map((x) => x.trim()).filter(Boolean);
    return [...selected, ...customList].join(', ');
  }

  async function generate() {
    if (!session) return;
    setLoading(true);
    setError(null);
    setRecipes(null);
    setStatus({});
    try {
      const r = await suggestRecipes({ meal, ingredients: chosenIngredients() });
      setRecipes(r);
      if (r.length === 0) setError(t('recipes.gen.none'));
      else setCollapsed(true); // po vygenerování ukázat jen recepty
    } catch (e) {
      console.error('Generování receptů selhalo:', e);
      setError(t('recipes.gen.error'));
    } finally {
      setLoading(false);
    }
  }

  async function logToDiary(recipe: SuggestedRecipe, idx: number) {
    if (!session) return;
    setStatus((p) => ({ ...p, [idx]: { ...p[idx], busy: 'log', error: undefined } }));
    try {
      // Zápis po surovinách: každá surovina jako samostatný záznam do zvolené fáze.
      for (const it of recipe.ingredients) {
        const n = entrySnapshot({ kcal: it.kcal_100g, protein: it.protein_100g, carbs: it.carbs_100g, fat: it.fat_100g }, it.grams);
        await addDiaryEntry(
          session.user.id,
          meal,
          it.grams,
          { name: it.name, kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat },
        );
      }
      setStatus((p) => ({ ...p, [idx]: { ...p[idx], busy: undefined, logged: true } }));
    } catch (e) {
      console.error('Zápis receptu do deníku selhal:', e);
      setStatus((p) => ({ ...p, [idx]: { ...p[idx], busy: undefined, error: e instanceof Error ? e.message : String(e) } }));
    }
  }

  async function saveToRecipes(recipe: SuggestedRecipe, idx: number) {
    if (!session) return;
    setStatus((p) => ({ ...p, [idx]: { ...p[idx], busy: 'save', error: undefined } }));
    try {
      await saveGeneratedRecipe(session.user.id, recipe, meal);
      setStatus((p) => ({ ...p, [idx]: { ...p[idx], busy: undefined, saved: true } }));
      onSaved?.();
    } catch (e) {
      console.error('Uložení receptu selhalo:', e);
      setStatus((p) => ({ ...p, [idx]: { ...p[idx], busy: undefined, error: e instanceof Error ? e.message : String(e) } }));
    }
  }

  if (!session) {
    return <Text style={s.muted}>{t('recipes.gen.needLogin')}</Text>;
  }

  return (
    <View style={{ gap: spacing.md }}>
      {/* Vstupní část (výběr) drží současnou šířku a je na střed. */}
      <View style={s.inputWrap}>
      {/* Hlavička výběru – sbalit/rozbalit */}
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={s.selectorHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.selectorTitle}>{t('recipes.gen.selection')}</Text>
          {collapsed && (
            <Text style={s.selectorSummary} numberOfLines={1}>
              {t(`meal.${meal}`)}{pickedCount > 0 ? ` · ${pickedCount} ${t('recipes.gen.ingredientsWord')}` : ''}
            </Text>
          )}
        </View>
        <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textMuted} />
      </Pressable>

      {!collapsed && (
        <>
      <Text style={s.intro}>{t('recipes.gen.intro')}</Text>

      {/* Fáze jídla */}
      <Text style={s.section}>{t('recipes.gen.mealLabel')}</Text>
      <View style={s.chipRow}>
        {MEALS.map((m) => {
          const active = meal === m;
          return (
            <Pressable key={m} onPress={() => setMeal(m)} accessibilityRole="button" accessibilityState={{ selected: active }}
              style={[s.chip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}>
              <Text style={{ color: active ? colors.onAccent : colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{t(`meal.${m}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Kategorie surovin */}
      {CATEGORIES.map((cat) => (
        <View key={cat.key} style={{ gap: spacing.xs }}>
          <Text style={s.section}>{t(`recipes.gen.cat.${cat.key}`)}</Text>
          <View style={s.chipRow}>
            {cat.items.map((item) => {
              const active = selected.has(item);
              return (
                <Pressable key={item} onPress={() => toggle(item)} accessibilityRole="button" accessibilityState={{ selected: active }}
                  style={[s.chip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}>
                  <Text style={{ color: active ? colors.onAccent : colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* Vlastní suroviny */}
      <Text style={s.section}>{t('recipes.gen.custom')}</Text>
      <TextInput
        value={custom}
        onChangeText={setCustom}
        placeholder={t('recipes.gen.customPlaceholder')}
        placeholderTextColor={colors.textFaint}
        style={s.input}
      />

      <Pressable style={[s.generateButton, loading && s.buttonDisabled]} onPress={generate} disabled={loading}>
        <Text style={s.generateText}>{loading ? t('recipes.gen.generating') : t('recipes.gen.generate')}</Text>
      </Pressable>
      {loading && <Loading size={72} />}
        </>
      )}

      {error && <Text style={s.error}>{error}</Text>}
      </View>

      {/* Výsledky – responzivní mřížka na celou šířku (1/2/3 sloupce). */}
      {recipes && recipes.length > 0 && (
        <View style={s.grid}>
      {recipes.map((r, idx) => {
        const totals = recipeTotals(r);
        const st = status[idx] ?? {};
        return (
          <View key={`${r.name}-${idx}`} style={[s.recipeCard, { width: cardWidth }]}>
            <Text style={s.recipeName}>{r.name}</Text>
            <Text style={s.recipeMeta}>
              {Math.round(totals.kcal)} {t('goal.unitKcal')} · {t('goal.protein')} {Math.round(totals.protein)} {t('goal.unitG')} · {t('goal.carbs')} {Math.round(totals.carbs)} {t('goal.unitG')} · {t('goal.fat')} {Math.round(totals.fat)} {t('goal.unitG')}
            </Text>

            <Text style={s.subLabel}>{t('recipes.ingredients')}</Text>
            {r.ingredients.map((it, i) => (
              <View key={`${it.name}-${i}`} style={s.ingRow}>
                <Text style={s.ingName} numberOfLines={1}>{it.name}</Text>
                <Text style={s.ingMeta}>{it.grams} g · {Math.round((it.kcal_100g * it.grams) / 100)} {t('goal.unitKcal')}</Text>
              </View>
            ))}

            <Text style={s.subLabel}>{t('recipes.gen.steps')}</Text>
            {r.steps.map((step, i) => (
              <Text key={i} style={s.step}>{i + 1}. {step}</Text>
            ))}

            <View style={s.cardActions}>
              <Pressable style={[s.actionPrimary, s.cardFlex, st.busy === 'log' && s.buttonDisabled]} onPress={() => logToDiary(r, idx)} disabled={!!st.busy}>
                <Text style={s.actionPrimaryText}>{st.logged ? t('recipes.gen.logged') : t('recipes.gen.logToDiary')}</Text>
              </Pressable>
              <Pressable style={[s.actionSecondary, s.cardFlex, st.busy === 'save' && s.buttonDisabled]} onPress={() => saveToRecipes(r, idx)} disabled={!!st.busy}>
                <Text style={s.actionSecondaryText}>{st.saved ? t('recipes.gen.savedToRecipes') : t('recipes.gen.saveToRecipes')}</Text>
              </Pressable>
            </View>
            {st.error && <Text style={s.error}>{st.error}</Text>}
          </View>
        );
      })}
        </View>
      )}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    inputWrap: { width: '100%', maxWidth: 960, alignSelf: 'center', gap: spacing.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center', alignItems: 'flex-start' },
    intro: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    selectorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    selectorTitle: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    selectorSummary: { color: c.textFaint, fontSize: fontSize.caption },
    section: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.sm },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: { minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
    input: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    generateButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
    generateText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    buttonDisabled: { opacity: 0.5 },
    muted: { color: c.textFaint, fontSize: fontSize.body, marginTop: spacing.md },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
    recipeCard: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
    recipeName: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    recipeMeta: { color: c.textMuted, fontSize: fontSize.caption },
    subLabel: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.medium, marginTop: spacing.sm },
    ingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    ingName: { color: c.text, fontSize: fontSize.body, flex: 1 },
    ingMeta: { color: c.textFaint, fontSize: fontSize.caption, flexShrink: 0 },
    step: { color: c.text, fontSize: fontSize.body, lineHeight: fontSize.body * 1.4 },
    cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    cardFlex: { flex: 1 },
    actionPrimary: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
    actionPrimaryText: { color: c.onAccent, fontSize: fontSize.caption, fontWeight: fontWeight.bold },
    actionSecondary: { minHeight: touchTarget, borderWidth: 1, borderColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
    actionSecondaryText: { color: c.accent, fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  });
