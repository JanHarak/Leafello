import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleG } from '@/components/GoogleG';
import { Leaf } from '@/components/LeafDecor';
import { Loading } from '@/components/Loading';
import { LottiePlayer } from '@/components/LottiePlayer';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { brandLeaf, brandLeafGreens, brandLeafTints, fontFamily, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme';

type Mode = 'signin' | 'signup';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// react-native-web přidává do stavu Pressable `hovered`; v RN typech chybí.
type HoverState = { hovered?: boolean };

/**
 * Magic link (přihlašovací odkaz e-mailem) je prozatím skrytý, dokud nemáme
 * vlastní doménu a SMTP – vestavěná Supabase e-mailová služba naráží na rate
 * limit. Až bude doména + SMTP, přepni na true.
 */
const EMAIL_LINK_ENABLED = false;

const MASCOT_LOTTIE = require('../../assets/avatar/animated/leafello_mascot_lottie_login.json');
const LEAF_CORNER = require('../../assets/leafello-web-assets/decor-background-corner.png');
const LEAF_CLUSTER = require('../../assets/leafello-web-assets/decor-leaf-cluster.png');

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** „Feature" dlaždice úvodní stránky – ikona v barevném kroužku + popisky. */
const FEATURES: { key: string; icon: IconName; tint: string; labelKey: string; subKey: string }[] = [
  { key: 'food', icon: 'bowl-mix', tint: brandLeafTints.food, labelKey: 'auth.featureFood', subKey: 'auth.featureFoodSub' },
  { key: 'move', icon: 'run', tint: brandLeafTints.move, labelKey: 'auth.featureMove', subKey: 'auth.featureMoveSub' },
  { key: 'sleep', icon: 'weather-night', tint: brandLeafTints.sleep, labelKey: 'auth.featureSleep', subKey: 'auth.featureSleepSub' },
  { key: 'water', icon: 'water', tint: brandLeafTints.water, labelKey: 'auth.featureWater', subKey: 'auth.featureWaterSub' },
];

/** Rozmístění dekorativních listů (SVG) kolem stránky – odpovídá návrhu. */
const SCATTER: { pos: ViewStyle; size: number; rot: number; opacity: number; pale?: boolean }[] = [
  { pos: { top: 74, left: 210 }, size: 62, rot: -24, opacity: 0.9 },
  { pos: { top: 30, left: '45%' }, size: 46, rot: 18, opacity: 0.75, pale: true },
  { pos: { top: 128, right: 250 }, size: 70, rot: -34, opacity: 0.9 },
  { pos: { top: 200, left: -16 }, size: 96, rot: 58, opacity: 0.6, pale: true },
  { pos: { top: 60, right: -18 }, size: 86, rot: -52, opacity: 0.6, pale: true },
  { pos: { top: 300, left: 22 }, size: 78, rot: 40, opacity: 0.75 },
  { pos: { top: 250, right: 50 }, size: 64, rot: 26, opacity: 0.8 },
  { pos: { top: '48%', left: '27%' }, size: 44, rot: 30, opacity: 0.5, pale: true },
  { pos: { bottom: 190, left: 56 }, size: 58, rot: -16, opacity: 0.75, pale: true },
  { pos: { bottom: 140, right: 116 }, size: 78, rot: -36, opacity: 0.75 },
  { pos: { bottom: 78, left: '35%' }, size: 50, rot: 20, opacity: 0.6, pale: true },
  { pos: { bottom: 92, right: '33%' }, size: 58, rot: -22, opacity: 0.65 },
  { pos: { top: 150, left: '52%' }, size: 40, rot: 44, opacity: 0.5, pale: true },
  { pos: { bottom: 220, right: 40 }, size: 52, rot: 12, opacity: 0.7 },
  // Trs v pravém spodním rohu (prohozeno – asset roh je vlevo dole)
  { pos: { bottom: 6, right: 8 }, size: 96, rot: -28, opacity: 0.85 },
  { pos: { bottom: 44, right: 74 }, size: 72, rot: 12, opacity: 0.7, pale: true },
  { pos: { bottom: 70, right: 130 }, size: 58, rot: -58, opacity: 0.6, pale: true },
  // Trs v pravém HORNÍM rohu (prohozeno s asset rohem)
  { pos: { top: 96, right: 8 }, size: 96, rot: -28, opacity: 0.85 },
  { pos: { top: 134, right: 78 }, size: 72, rot: 12, opacity: 0.7, pale: true },
  { pos: { top: 160, right: 134 }, size: 58, rot: -58, opacity: 0.6, pale: true },
  // Pár listů za formulářem vpravo dole
  { pos: { bottom: 150, right: '39%' }, size: 66, rot: -22, opacity: 0.6, pale: true },
  { pos: { bottom: 100, right: '42%' }, size: 52, rot: 24, opacity: 0.55 },
];

type Feature = (typeof FEATURES)[number];

function FeatureCard({ f, style }: { f: Feature; style?: ViewStyle }) {
  const s = styles;
  return (
    <View style={[s.feature, style]} accessible accessibilityLabel={`${t(f.labelKey)}. ${t(f.subKey)}`}>
      <View style={s.featureBadge}>
        <MaterialCommunityIcons name={f.icon} size={26} color={f.tint} />
      </View>
      <Text style={s.featureLabel}>{t(f.labelKey)}</Text>
      <Text style={s.featureSub}>{t(f.subKey)}</Text>
    </View>
  );
}

/**
 * Úvodní přihlašovací obrazovka Leafello podle návrhu (data/web-loginpage.png).
 * Zelené brandové provedení (paleta `brandLeaf`) nezávislé na light/dark motivu.
 * Název „Leafello" je jen v levém horním rohu jako text + loading animace místo
 * loga. Karta uprostřed má také loading animaci, přihlášení/registraci e-mailem
 * + heslem, Google a magic link. Kolem jsou rozházené dekorativní listy (SVG),
 * maskot (Fitlístek), „feature" dlaždice a ručně psané slogany (font Caveat).
 */
export function AuthLanding() {
  const s = styles;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1300;
  const { signInWithGoogle, signInWithEmail, signInWithPassword, signUpWithPassword, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // „Vítej zpět" jen pro vracejícího se návštěvníka. První návštěva na tomto
  // zařízení (bez příznaku v localStorage) ukáže jen „Vítej". Čte se synchronně
  // v inicializátoru stavu, aby nedošlo k probliknutí.
  const [returning] = useState<boolean>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem('leafello_visited') === '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('leafello_visited', '1');
    } catch {
      // localStorage nemusí být dostupné (privátní režim) – tiše ignoruj.
    }
  }, []);

  // Na webu doplň rukopisné písmo Caveat pro slogany (Google Fonts).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'leafello-hand-font';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap';
    document.head.appendChild(link);
  }, []);

  function reset() {
    setError(null);
    setNotice(null);
  }

  async function submitPassword() {
    reset();
    if (!EMAIL_RE.test(email)) return setError(t('auth.invalidEmail'));
    if (password.length < 6) return setError(t('auth.errorPassword'));
    if (mode === 'signup' && password !== confirm) return setError(t('auth.errorPasswordMatch'));
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
      } else {
        const { needsConfirmation } = await signUpWithPassword(email, password);
        if (needsConfirmation) setNotice(t('auth.confirmEmail'));
      }
    } catch {
      setError(mode === 'signin' ? t('auth.errorSignIn') : t('auth.errorSignUp'));
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    reset();
    if (!EMAIL_RE.test(email)) return setError(t('auth.invalidEmail'));
    setBusy(true);
    try {
      await signInWithEmail(email);
      setNotice(t('auth.linkSent'));
    } catch {
      setError(t('auth.invalidEmail'));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    reset();
    if (!EMAIL_RE.test(email)) return setError(t('auth.forgotNeedEmail'));
    setBusy(true);
    try {
      await resetPassword(email);
      setNotice(t('auth.resetSent'));
    } catch {
      setError(t('auth.invalidEmail'));
    } finally {
      setBusy(false);
    }
  }

  const card = (
    <View style={s.card}>
      {/* Místo statického loga animovaný brand (loading animace) */}
      <Loading size={92} />
      <Text style={s.welcome}>
        {returning ? t('auth.welcome') : t('auth.welcomeTo')}{' '}
        <Text style={s.welcomeAccent}>{returning ? t('auth.welcomeBack') : t('app.name')}</Text>
      </Text>
      <Text style={s.subtitle}>{t('auth.subtitle')}</Text>

      <Pressable style={({ hovered }: HoverState) => [s.google, hovered && s.googleHover]} onPress={() => signInWithGoogle()} accessibilityRole="button">
        <GoogleG size={18} />
        <Text style={s.googleText}>{t('auth.google')}</Text>
      </Pressable>

      <View style={s.dividerRow}>
        <View style={s.line} />
        <Text style={s.or}>{t('auth.or')}</Text>
        <View style={s.line} />
      </View>

      {/* Přepínač přihlášení / registrace */}
      <View style={s.tabRow}>
        <Pressable
          onPress={() => { setMode('signin'); reset(); }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'signin' }}
          style={({ hovered }: HoverState) => [s.tab, mode === 'signin' && s.tabActive, hovered && mode !== 'signin' && s.tabHover]}
        >
          <Text style={mode === 'signin' ? s.tabTextActive : s.tabText}>{t('auth.tabSignIn')}</Text>
        </Pressable>
        <Pressable
          onPress={() => { setMode('signup'); reset(); }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'signup' }}
          style={({ hovered }: HoverState) => [s.tab, mode === 'signup' && s.tabActive, hovered && mode !== 'signup' && s.tabHover]}
        >
          <Text style={mode === 'signup' ? s.tabTextActive : s.tabText}>{t('auth.tabSignUp')}</Text>
        </Pressable>
      </View>

      {/* E-mail */}
      <View style={s.field}>
        <Feather name="user" size={18} color={brandLeaf.inkSoft} />
        <TextInput
          value={email}
          onChangeText={(v) => { setEmail(v); reset(); }}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={brandLeaf.inkSoft}
          autoCapitalize="none"
          keyboardType="email-address"
          style={s.fieldInput}
        />
      </View>

      {/* Heslo */}
      <View style={s.field}>
        <Feather name="lock" size={18} color={brandLeaf.inkSoft} />
        <TextInput
          value={password}
          onChangeText={(v) => { setPassword(v); reset(); }}
          placeholder={t('auth.password')}
          placeholderTextColor={brandLeaf.inkSoft}
          secureTextEntry={!showPw}
          autoCapitalize="none"
          style={s.fieldInput}
        />
        <Pressable onPress={() => setShowPw((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <Feather name={showPw ? 'eye' : 'eye-off'} size={18} color={brandLeaf.inkSoft} />
        </Pressable>
      </View>

      {mode === 'signup' && (
        <View style={s.field}>
          <Feather name="lock" size={18} color={brandLeaf.inkSoft} />
          <TextInput
            value={confirm}
            onChangeText={(v) => { setConfirm(v); reset(); }}
            placeholder={t('auth.passwordConfirm')}
            placeholderTextColor={brandLeaf.inkSoft}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            style={s.fieldInput}
          />
        </View>
      )}

      <Pressable style={({ hovered }: HoverState) => [s.primary, busy && s.disabled, hovered && !busy && s.primaryHover]} onPress={submitPassword} disabled={busy} accessibilityRole="button">
        <Text style={s.primaryText}>{mode === 'signin' ? t('auth.signIn') : t('auth.register')}</Text>
      </Pressable>

      {mode === 'signin' && (
        <Pressable style={s.forgot} onPress={forgotPassword} disabled={busy} accessibilityRole="button">
          {({ hovered }: HoverState) => (
            <Text style={[s.forgotText, hovered && s.forgotTextHover]}>{t('auth.forgotPassword')}</Text>
          )}
        </Pressable>
      )}

      {EMAIL_LINK_ENABLED && (
        <Pressable style={({ hovered }: HoverState) => [s.magic, hovered && s.magicHover]} onPress={sendMagicLink} disabled={busy} accessibilityRole="button">
          <Text style={s.magicText}>{t('auth.sendLink')}</Text>
        </Pressable>
      )}

      {notice && <Text style={s.notice}>{notice}</Text>}
      {error && <Text style={s.error}>{error}</Text>}

      {/* Lístkový oddělovač + slogan (rukopisné písmo) */}
      <View style={s.leafDivider}>
        <View style={s.line} />
        <Leaf size={24} />
        <View style={s.line} />
      </View>
      <Text style={s.tagline}>{t('auth.tagline')} ♥</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      {/* Dekorativní listový asset – v levém DOLNÍM rohu. Ostatní rohy řeší
          transparentní SVG listy (SCATTER). */}
      <Image source={LEAF_CORNER} style={[s.corner, s.cornerBL]} contentFit="contain" accessibilityLabel="" />

      {/* Rozházené dekorativní listy (SVG, jen ozdoba) */}
      {SCATTER.map((l, i) => (
        <Leaf
          key={i}
          size={l.size}
          from={l.pale ? brandLeafGreens.pale : brandLeafGreens.light}
          to={l.pale ? brandLeafGreens.mid : brandLeafGreens.deep}
          style={[s.scatterLeaf, l.pos, { opacity: l.opacity, transform: [{ rotate: `${l.rot}deg` }] }]}
        />
      ))}

      {/* Název jen v levém horním rohu: loading animace jako logo + text */}
      <View style={s.brand}>
        <Loading size={72} />
        <Text style={s.brandName}>{t('app.name')}</Text>
      </View>

      {/* Ručně psaný slogan vpravo nahoře (jen na širokém layoutu) */}
      {wide && <Text style={[s.hand, s.handTopRight]}>{t('auth.hwSteps')} ♥</Text>}

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.main}>
        <View style={wide ? s.row : s.stack}>
          {wide && (
            <View style={s.sideLeft}>
              <FeatureCard f={FEATURES[0]} style={s.jidloCard} />
              <View style={s.mascotWrap}>
                <Image source={LEAF_CLUSTER} style={s.mascotLeaves} contentFit="contain" accessibilityLabel="" />
                <View style={s.mascot}>
                  <LottiePlayer source={MASCOT_LOTTIE} size={480} mood="happy" />
                </View>
              </View>
            </View>
          )}

          {card}

          {wide && (
            <View style={s.sideRight}>
              {/* Řízená plocha: Pohyb vlevo nahoře, Spánek vpravo, Voda vlevo dole */}
              <FeatureCard f={FEATURES[1]} style={s.fPohyb} />
              <FeatureCard f={FEATURES[2]} style={s.fSpanek} />
              <FeatureCard f={FEATURES[3]} style={s.fVoda} />
              {/* Slogan blízko Spánku; „Zdravý život" pod a mezi Vodou a Spánkem */}
              <Text style={[s.hand, s.handNearSleep]}>
                {`${t('auth.slogan').replace(/·/g, ' ').replace(/\s+/g, ' ').trim().split(' ').join('\n')} ♥`}
              </Text>
              <Text style={[s.hand, s.handUnderCards]}>{t('auth.hwLife')} ♥</Text>
            </View>
          )}
        </View>
        {/* Na úzké obrazovce feature dlaždice pod kartou */}
        {!wide && (
          <View style={s.featureWrap}>
            {FEATURES.map((f) => (
              <FeatureCard key={f.key} f={f} />
            ))}
          </View>
        )}
        </View>

        {/* Patička uvnitř scrollu – na krátké stránce sedí dole, jinak doscrolluje */}
        <View style={s.footer}>
          <View style={s.footerLinks}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/legal/privacy')}>
              <Text style={s.footerLink}>{t('legal.privacy')}</Text>
            </Pressable>
            <Text style={s.footerDot}>·</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/legal/terms')}>
              <Text style={s.footerLink}>{t('legal.terms')}</Text>
            </Pressable>
          </View>
          <Text style={s.footerText}>{t('attribution.off')}</Text>
          <Text style={s.footerText}>{t('attribution.nutridb')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brandLeaf.bg },

  // Dekorativní listy
  scatterLeaf: { position: 'absolute' },
  corner: { position: 'absolute', width: 240, height: 200, opacity: 0.9 },
  cornerBL: { bottom: 0, left: 0, transform: [{ scaleY: -1 }, { rotate: '180deg' }] },

  // Název v levém horním rohu (text + loading animace jako logo)
  brand: { position: 'absolute', top: spacing.md, left: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  brandName: { color: brandLeaf.ink, fontSize: 40, fontWeight: fontWeight.bold },

  // Ručně psané slogany
  hand: { color: brandLeaf.accent, fontFamily: fontFamily.hand, fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: 'center', lineHeight: fontSize.title * 1.1 },
  handTopRight: { position: 'absolute', top: spacing.xl, right: spacing.xl, maxWidth: 220, zIndex: 5 },
  handNearSleep: { position: 'absolute', top: 180, right: -160, maxWidth: 160, zIndex: 5 },
  handUnderCards: { position: 'absolute', fontSize: 32, top: 380, left: 60, maxWidth: 210, zIndex: 5, transform: [{ rotate: '-30deg' }] },

  scroll: { flexGrow: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 96, paddingBottom: 0 },
  main: { flexGrow: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  stack: { width: '100%', alignItems: 'center' },
  sideLeft: { width: 360, alignItems: 'center', justifyContent: 'center' },
  // Pravý sloupec jako řízená plocha (absolutní pozice dlaždic + textů)
  sideRight: { width: 360, height: 470, position: 'relative' },
  fPohyb: { position: 'absolute', top: 0, left: 8 },
  fSpanek: { position: 'absolute', top: 80, right: 8 },
  fVoda: { position: 'absolute', top: 175, left: 8 },
  jidloCard: { alignSelf: 'flex-start', marginBottom: -spacing.xl, zIndex: 2 },
  mascotWrap: { position: 'relative', alignItems: 'center', justifyContent: 'flex-end' },
  mascotLeaves: { position: 'absolute', bottom: -8, width: 380, height: 130, opacity: 0.9, zIndex: 0 },
  mascot: { width: 480, height: 480, zIndex: 1, alignItems: 'center', justifyContent: 'center' },

  // Feature dlaždice (kód, ne obrázek)
  featureWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xl },
  feature: { width: 152, backgroundColor: brandLeaf.card, borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.md, alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: brandLeaf.border, shadowColor: brandLeaf.ink, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  featureBadge: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: brandLeaf.field, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  featureLabel: { color: brandLeaf.ink, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  featureSub: { color: brandLeaf.inkSoft, fontSize: fontSize.caption, textAlign: 'center', lineHeight: fontSize.caption * 1.35 },

  card: { width: '100%', maxWidth: 500, backgroundColor: brandLeaf.card, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, alignItems: 'stretch', shadowColor: brandLeaf.ink, shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 4 },
  welcome: { color: brandLeaf.ink, fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: 'center' },
  welcomeAccent: { color: brandLeaf.accent },
  subtitle: { color: brandLeaf.inkSoft, fontSize: fontSize.body, textAlign: 'center', lineHeight: fontSize.body * 1.5, marginBottom: spacing.sm },

  google: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: brandLeaf.card, borderWidth: 1, borderColor: brandLeaf.border, borderRadius: radius.pill },
  googleHover: { backgroundColor: brandLeaf.fieldHover, borderColor: brandLeaf.accent },
  googleText: { color: brandLeaf.ink, fontSize: fontSize.body, fontWeight: fontWeight.medium },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: brandLeaf.border },
  or: { color: brandLeaf.inkSoft, fontSize: fontSize.caption },

  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: brandLeaf.border, backgroundColor: brandLeaf.field },
  tabActive: { backgroundColor: brandLeaf.accent, borderColor: brandLeaf.accent },
  tabHover: { backgroundColor: brandLeaf.fieldHover, borderColor: brandLeaf.accent },
  tabText: { color: brandLeaf.ink, fontSize: fontSize.body, fontWeight: fontWeight.medium },
  tabTextActive: { color: brandLeaf.card, fontSize: fontSize.body, fontWeight: fontWeight.bold },

  field: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: brandLeaf.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: brandLeaf.field },
  fieldInput: { flex: 1, color: brandLeaf.ink, fontSize: fontSize.body },

  primary: { minHeight: touchTarget, backgroundColor: brandLeaf.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  primaryHover: { backgroundColor: brandLeaf.accentHover },
  primaryText: { color: brandLeaf.card, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  disabled: { opacity: 0.5 },
  magic: { minHeight: touchTarget, borderWidth: 1, borderColor: brandLeaf.border, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  magicHover: { backgroundColor: brandLeaf.fieldHover, borderColor: brandLeaf.accent },
  magicText: { color: brandLeaf.ink, fontSize: fontSize.body, fontWeight: fontWeight.medium },
  forgot: { alignSelf: 'center', paddingVertical: spacing.xs },
  forgotText: { color: brandLeaf.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  forgotTextHover: { textDecorationLine: 'underline' },

  notice: { color: brandLeaf.accent, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xs },
  error: { color: brandLeaf.error, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xs },

  leafDivider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  tagline: { color: brandLeaf.accent, fontFamily: fontFamily.hand, fontSize: fontSize.subtitle, textAlign: 'center', marginTop: spacing.sm },

  footer: { width: '100%', marginTop: spacing.xxl, marginBottom: 0, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.xs, alignItems: 'center' },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerLink: { color: brandLeaf.ink, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  footerDot: { color: brandLeaf.inkSoft, fontSize: fontSize.caption },
  footerText: { color: brandLeaf.inkSoft, fontSize: fontSize.caption, textAlign: 'center' },
});
