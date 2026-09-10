import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarcodeScanner } from '@/components/BarcodeScanner';
import { CameraCapture } from '@/components/CameraCapture';
import { Loading } from '@/components/Loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { addDiaryEntry, getFoodByBarcode, lookupBarcodeOFF, searchFoods, type BarcodeProduct, type FoodRow } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';
import { AppFooter } from '@/components/AppFooter';

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

type Tab = 'photo' | 'barcode';

export default function Photo() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session } = useAuth();

  const [tab, setTab] = useState<Tab>('photo');

  // Fotka (AI)
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [notFood, setNotFood] = useState(false);
  const [failedMsg, setFailedMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [grams, setGrams] = useState<Record<number, string>>({});
  const [meal, setMeal] = useState<MealType>('lunch');
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Čárový kód
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [pGrams, setPGrams] = useState('100');
  const [pMeal, setPMeal] = useState<MealType>('lunch');
  const [bcMsg, setBcMsg] = useState<string | null>(null);
  const [bcError, setBcError] = useState<string | null>(null);
  const [bcLogged, setBcLogged] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodRow[]>([]);

  function resetPhoto() {
    setItems(null);
    setImageUri(null);
    setNotFood(false);
    setFailedMsg(null);
    setLogged(false);
    setError(null);
    setSelected(new Set());
    setGrams({});
  }

  function resetBarcode() {
    setScanning(false);
    setLookupBusy(false);
    setProduct(null);
    setPGrams('100');
    setBcMsg(null);
    setBcError(null);
    setBcLogged(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  /* -------------------- Fotka (AI) -------------------- */

  async function runAnalysis(uri: string, width?: number, height?: number) {
    if (!session) return;
    resetPhoto();
    setBusy(true);
    try {
      const actions: ImageManipulator.Action[] = [];
      const w = width ?? 0;
      const h = height ?? 0;
      if (Math.max(w, h) > 1024) {
        actions.push(w >= h ? { resize: { width: 1024 } } : { resize: { height: 1024 } });
      }
      const manip = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setImageUri(manip.uri);

      const uid = session.user.id;
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const resp = await fetch(manip.uri);
      const blob = await resp.blob();
      const up = await supabase.storage.from('meal-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;

      const { data, error: fnErr } = await supabase.functions.invoke('analyze-photo', { body: { storage_path: path } });
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

  async function pickFromLibrary() {
    if (!session || busy) return;
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled) return;
    const a = picked.assets[0];
    runAnalysis(a.uri, a.width, a.height);
  }

  async function pickFromCamera() {
    if (!session || busy) return;
    if (Platform.OS === 'web') {
      // Web: otevři živý fotoaparát (getUserMedia) přímo v appce.
      resetPhoto();
      setCameraOpen(true);
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const shot = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (shot.canceled) return;
    const a = shot.assets[0];
    runAnalysis(a.uri, a.width, a.height);
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

  /* -------------------- Čárový kód -------------------- */

  async function handleCode(code: string) {
    const c = code.trim();
    if (!c || lookupBusy) return;
    setScanning(false);
    setBcMsg(null);
    setBcError(null);
    setProduct(null);
    setBcLogged(false);
    setSearchResults([]);
    setSearchQuery('');
    setLookupBusy(true);
    try {
      let prod = await getFoodByBarcode(c);
      if (!prod) prod = await lookupBarcodeOFF(c);
      if (prod) {
        setProduct(prod);
        setPGrams('100');
      } else {
        setBcMsg('barcode.notFound');
      }
    } catch (e) {
      setBcError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookupBusy(false);
    }
  }

  async function doSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setSearchResults(await searchFoods(q));
    } catch {
      // ticho – hledání je doplněk
    }
  }

  function pickFood(f: FoodRow) {
    setProduct({
      name: f.name,
      brand: f.brand,
      kcal_100g: f.kcal_100g,
      protein_100g: f.protein_100g,
      carbs_100g: f.carbs_100g,
      fat_100g: f.fat_100g,
      foodId: f.id,
    });
    setPGrams('100');
    setBcMsg(null);
    setSearchResults([]);
    setSearchQuery('');
  }

  async function logProduct() {
    if (!session || !product) return;
    const g = Number(pGrams);
    if (Number.isNaN(g) || g <= 0) return;
    const f = g / 100;
    try {
      await addDiaryEntry(
        session.user.id,
        pMeal,
        g,
        {
          name: product.name,
          kcal: product.kcal_100g * f,
          protein: product.protein_100g * f,
          carbs: product.carbs_100g * f,
          fat: product.fat_100g * f,
        },
        product.foodId,
      );
      setBcLogged(true);
    } catch (e) {
      setBcError(e instanceof Error ? e.message : String(e));
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    resetPhoto();
    resetBarcode();
  }

  const pKcal = product ? Math.round((product.kcal_100g * (Number(pGrams) || 0)) / 100) : 0;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.about}>
          <Text style={s.aboutTitle}>{t('photo.aboutTitle')}</Text>
          <Text style={s.aboutBody}>{t('photo.aboutBody')}</Text>
        </View>

        {/* Segmentový přepínač Fotka / Čárový kód */}
        <View style={s.segment}>
          <Pressable onPress={() => switchTab('photo')} accessibilityRole="button" accessibilityState={{ selected: tab === 'photo' }} style={[s.segBtn, tab === 'photo' && s.segBtnActive]}>
            <Feather name="camera" size={18} color={tab === 'photo' ? colors.accent : colors.textMuted} />
            <Text style={tab === 'photo' ? s.segTextActive : s.segText}>{t('barcode.tabPhoto')}</Text>
          </Pressable>
          <Pressable onPress={() => switchTab('barcode')} accessibilityRole="button" accessibilityState={{ selected: tab === 'barcode' }} style={[s.segBtn, tab === 'barcode' && s.segBtnActive]}>
            <MaterialCommunityIcons name="barcode-scan" size={18} color={tab === 'barcode' ? colors.accent : colors.textMuted} />
            <Text style={tab === 'barcode' ? s.segTextActive : s.segText}>{t('barcode.tabScan')}</Text>
          </Pressable>
        </View>

        {!session ? (
          <Text style={s.muted}>{t('auth.subtitle')}</Text>
        ) : tab === 'photo' ? (
          <>
            {cameraOpen ? (
              <CameraCapture
                onCapture={(uri) => { setCameraOpen(false); runAnalysis(uri); }}
                onCancel={() => setCameraOpen(false)}
                onError={() => { setCameraOpen(false); setFailedMsg('barcode.cameraDenied'); }}
              />
            ) : (
              <View style={s.pickRow}>
                <Pressable style={[s.pick, busy && s.dim]} onPress={pickFromCamera} disabled={busy}>
                  <Feather name="camera" size={18} color={colors.onAccent} />
                  <Text style={s.pickText}>{t('photo.takePhoto')}</Text>
                </Pressable>
                <Pressable style={[s.pickAlt, busy && s.dim]} onPress={pickFromLibrary} disabled={busy}>
                  <Feather name="image" size={18} color={colors.text} />
                  <Text style={s.pickAltText}>{busy ? t('photo.analyzing') : t('photo.fromLibrary')}</Text>
                </Pressable>
              </View>
            )}

            {imageUri && <Image source={{ uri: imageUri }} style={s.preview} contentFit="cover" accessibilityLabel={t('photo.title')} />}

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
                        <TextInput value={grams[i] ?? ''} onChangeText={(v) => setGrams((p) => ({ ...p, [i]: v }))} keyboardType="numeric" style={s.gramsInput} />
                        <Text style={s.gramsUnit}>g</Text>
                        <Text style={s.itemKcal}>
                          {Math.round(((it.kcal_100g ?? 0) * (Number(grams[i]) || 0)) / 100)} {t('goal.unitKcal')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                <View style={s.mealRow}>
                  {MEALS.map((m) => (
                    <Pressable key={m} onPress={() => setMeal(m)} style={[s.mealChip, { backgroundColor: meal === m ? colors.accent : colors.surface, borderColor: meal === m ? colors.accent : colors.border }]}>
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
        ) : (
          /* -------- Záložka Čárový kód -------- */
          <>
            {Platform.OS === 'web' ? (
              scanning ? (
                <View style={s.scanBox}>
                  <BarcodeScanner
                    onDetected={handleCode}
                    onError={() => {
                      setScanning(false);
                      setBcMsg('barcode.cameraDenied');
                    }}
                  />
                  <Pressable style={s.pickAlt} onPress={() => setScanning(false)}>
                    <Text style={s.pickAltText}>{t('barcode.stop')}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={[s.pick, lookupBusy && s.dim]} onPress={() => { resetBarcode(); setScanning(true); }} disabled={lookupBusy}>
                  <Text style={s.pickText}>{t('barcode.scan')}</Text>
                </Pressable>
              )
            ) : (
              <Text style={s.info}>{t('barcode.webOnly')}</Text>
            )}

            {/* Ruční zadání kódu */}
            <Text style={s.label}>{t('barcode.manualLabel')}</Text>
            <View style={s.manualRow}>
              <TextInput
                value={manualCode}
                onChangeText={setManualCode}
                placeholder={t('barcode.manualPlaceholder')}
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={s.codeInput}
              />
              <Pressable style={[s.lookupBtn, lookupBusy && s.dim]} onPress={() => handleCode(manualCode)} disabled={lookupBusy}>
                <Text style={s.lookupText}>{t('barcode.lookup')}</Text>
              </Pressable>
            </View>

            {bcMsg && <Text style={s.info}>{t(bcMsg)}</Text>}
            {bcError && <Text style={s.error}>{bcError}</Text>}

            {/* Ruční hledání (fallback, když kód není nikde) */}
            {bcMsg === 'barcode.notFound' && (
              <>
                <TextInput
                  value={searchQuery}
                  onChangeText={doSearch}
                  placeholder={t('barcode.searchPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  style={s.codeInput}
                />
                {searchResults.map((f) => (
                  <Pressable key={f.id} style={s.result} onPress={() => pickFood(f)}>
                    <Text style={s.resultName}>{f.name}</Text>
                    <Text style={s.resultKcal}>{Math.round(f.kcal_100g)} {t('goal.unitKcal')}/100 g</Text>
                  </Pressable>
                ))}
              </>
            )}

            {/* Potvrzení a zápis nalezené potraviny */}
            {product && (
              <View style={s.productCard}>
                <Text style={s.productName}>{product.name}</Text>
                {product.brand && <Text style={s.productBrand}>{product.brand}</Text>}
                <Text style={s.productMacro}>
                  {Math.round(product.kcal_100g)} {t('goal.unitKcal')} · B {Math.round(product.protein_100g)} · S {Math.round(product.carbs_100g)} · T {Math.round(product.fat_100g)} / 100 g
                </Text>

                <View style={s.gramsRow}>
                  <TextInput value={pGrams} onChangeText={setPGrams} keyboardType="numeric" style={s.gramsInput} />
                  <Text style={s.gramsUnit}>g</Text>
                  <Text style={s.itemKcal}>{pKcal} {t('goal.unitKcal')}</Text>
                </View>

                <View style={s.mealRow}>
                  {MEALS.map((m) => (
                    <Pressable key={m} onPress={() => setPMeal(m)} style={[s.mealChip, { backgroundColor: pMeal === m ? colors.accent : colors.surface, borderColor: pMeal === m ? colors.accent : colors.border }]}>
                      <Text style={{ color: pMeal === m ? colors.onAccent : colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{t(`meal.${m}`)}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable style={s.logButton} onPress={logProduct}>
                  <Text style={s.logText}>{t('barcode.log')}</Text>
                </Pressable>
                {bcLogged && <Text style={s.logged}>{t('photo.logged')}</Text>}
              </View>
            )}
          </>
        )}
        <AppFooter />
      </ScrollView>
      {(busy || lookupBusy) && <Loading overlay />}
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.md, paddingBottom: 0, maxWidth: 960, width: '100%', alignSelf: 'center' },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    about: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    aboutTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    aboutBody: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },

    segment: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, backgroundColor: c.surfaceElevated, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
    segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: touchTarget, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
    segBtnActive: { backgroundColor: c.surface, shadowColor: c.text, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    segText: { color: c.textMuted, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    segTextActive: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold },

    pickRow: { flexDirection: 'row', gap: spacing.sm },
    pick: { flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: touchTarget * 1.2, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    pickText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    pickAlt: { flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: touchTarget * 1.2, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    pickAltText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    dim: { opacity: 0.6 },
    preview: { width: '100%', height: 240, borderRadius: radius.lg, backgroundColor: c.surfaceElevated },

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
    itemKcal: { color: c.textFaint, fontSize: fontSize.body, marginLeft: 'auto' },
    mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    mealChip: { minHeight: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    logButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    logText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    logged: { color: c.accent, fontSize: fontSize.body },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },

    // Čárový kód
    scanBox: { gap: spacing.sm },
    label: { color: c.textMuted, fontSize: fontSize.caption, marginTop: spacing.sm },
    manualRow: { flexDirection: 'row', gap: spacing.sm },
    codeInput: { flex: 1, minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    lookupBtn: { minHeight: touchTarget, paddingHorizontal: spacing.lg, backgroundColor: c.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    lookupText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surface },
    resultName: { flex: 1, color: c.text, fontSize: fontSize.body },
    resultKcal: { color: c.textFaint, fontSize: fontSize.caption },
    productCard: { borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: c.surface, gap: spacing.sm },
    productName: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    productBrand: { color: c.textMuted, fontSize: fontSize.caption },
    productMacro: { color: c.textMuted, fontSize: fontSize.caption },
  });
