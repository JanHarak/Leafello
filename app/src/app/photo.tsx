import { Stack } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addDiaryEntry } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

interface Item {
  name: string;
  estimated_grams: number;
  confidence?: number;
  kcal_100g?: number;
  protein_100g?: number;
  carbs_100g?: number;
  fat_100g?: number;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const LOW_CONFIDENCE = 0.4;

export default function Photo() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);
  const { session } = useAuth();

  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [notFood, setNotFood] = useState(false);
  const [failedMsg, setFailedMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [grams, setGrams] = useState<Record<number, string>>({});
  const [meal, setMeal] = useState<MealType>('lunch');
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setItems(null);
    setNotFood(false);
    setFailedMsg(null);
    setLogged(false);
    setError(null);
    setSelected(new Set());
    setGrams({});
  }

  async function pickAndAnalyze() {
    if (!session) return;
    reset();
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setBusy(false);
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (picked.canceled) {
        setBusy(false);
        return;
      }
      const asset = picked.assets[0];

      // Zmenšení na max 1024 px delší strany, JPEG kvalita 80 (F-10).
      const actions: ImageManipulator.Action[] = [];
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      if (Math.max(w, h) > 1024) {
        actions.push(w >= h ? { resize: { width: 1024 } } : { resize: { height: 1024 } });
      }
      const manip = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      const uid = session.user.id;
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const resp = await fetch(manip.uri);
      const blob = await resp.blob();
      const up = await supabase.storage.from('meal-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;

      const { data, error: fnErr } = await supabase.functions.invoke('analyze-photo', {
        body: { storage_path: path },
      });
      if (fnErr) {
        const status = (fnErr as { context?: { status?: number } }).context?.status;
        setFailedMsg(status === 429 ? 'photo.rateLimited' : 'photo.failed');
      } else if (data?.not_food) {
        setNotFood(true);
      } else if (data?.status === 'failed') {
        setFailedMsg(typeof data.message === 'string' ? data.message : 'photo.failed');
      } else {
        const list = (data?.items ?? []) as Item[];
        const g: Record<number, string> = {};
        const sel = new Set<number>();
        list.forEach((it, i) => {
          g[i] = String(Math.round(it.estimated_grams));
          sel.add(i);
        });
        setItems(list);
        setGrams(g);
        setSelected(sel);
      }
    } catch (e) {
      console.error('Fotoanalýza selhala:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function logSelected() {
    if (!session || !items) return;
    const uid = session.user.id;
    try {
      for (const i of selected) {
        const it = items[i];
        const g = Number(grams[i]);
        if (Number.isNaN(g) || g <= 0) continue;
        const f = g / 100;
        await addDiaryEntry(uid, meal, g, {
          name: it.name,
          kcal: (it.kcal_100g ?? 0) * f,
          protein: (it.protein_100g ?? 0) * f,
          carbs: (it.carbs_100g ?? 0) * f,
          fat: (it.fat_100g ?? 0) * f,
        });
      }
      setLogged(true);
    } catch (e) {
      console.error('Zápis z fotky selhal:', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('photo.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : (
          <>
            <Pressable style={[s.pick, busy && { opacity: 0.6 }]} onPress={pickAndAnalyze} disabled={busy}>
              <Text style={s.pickText}>{busy ? t('photo.analyzing') : t('photo.pick')}</Text>
            </Pressable>

            {notFood && <Text style={s.info}>{t('photo.notFood')}</Text>}
            {failedMsg && <Text style={s.info}>{t(failedMsg)}</Text>}
            {error && <Text style={s.error}>{error}</Text>}

            {items && items.length > 0 && (
              <>
                <Text style={s.estimate}>{t('photo.estimate')}</Text>
                {items.map((it, i) => {
                  const isSel = selected.has(i);
                  const lowConf = typeof it.confidence === 'number' && it.confidence < LOW_CONFIDENCE;
                  return (
                    <Pressable key={i} style={[s.item, { borderColor: isSel ? colors.accent : colors.border }]} onPress={() => toggle(i)}>
                      <View style={s.itemHead}>
                        <Text style={s.check}>{isSel ? '☑' : '☐'}</Text>
                        <Text style={s.itemName}>{it.name}</Text>
                        {lowConf && <Text style={s.lowConf}>{t('photo.lowConfidence')}</Text>}
                      </View>
                      <View style={s.gramsRow}>
                        <TextInput
                          value={grams[i] ?? ''}
                          onChangeText={(v) => setGrams((p) => ({ ...p, [i]: v }))}
                          keyboardType="numeric"
                          style={s.gramsInput}
                        />
                        <Text style={s.gramsUnit}>g</Text>
                      </View>
                    </Pressable>
                  );
                })}

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

                <Pressable style={s.logButton} onPress={logSelected}>
                  <Text style={s.logText}>{t('photo.logSelected')}</Text>
                </Pressable>
                {logged && <Text style={s.logged}>{t('photo.logged')}</Text>}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    pick: { minHeight: touchTarget * 1.2, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    pickText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    info: { color: c.textMuted, fontSize: fontSize.body, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
    estimate: { color: c.notice, backgroundColor: c.noticeBackground, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.caption },
    item: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surface, gap: spacing.sm },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    check: { fontSize: fontSize.subtitle, color: c.accent },
    itemName: { flex: 1, color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    lowConf: { color: c.notice, fontSize: fontSize.caption, backgroundColor: c.noticeBackground, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
    gramsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    gramsInput: { width: 90, minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.background, fontSize: fontSize.body },
    gramsUnit: { color: c.textMuted, fontSize: fontSize.body },
    mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    mealChip: { minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    logButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    logText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    logged: { color: c.accent, fontSize: fontSize.body },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
