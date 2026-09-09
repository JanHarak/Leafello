import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarLottie } from '@/components/AvatarLottie';
import { GoogleG } from '@/components/GoogleG';
import { Loading } from '@/components/Loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

type Mode = 'signin' | 'signup';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Úvodní přihlašovací obrazovka pro nepřihlášeného uživatele: Google, e-mail
 * + heslo (přihlášení i registrace) a magic link jako alternativa bez hesla.
 * Na širokém rozložení lemují formulář dekorativní animace (vlevo loading,
 * vpravo veselý avatar). Dole patička s odkazy a atribucí.
 */
export function AuthLanding() {
  const { colors } = useTheme();
  const s = styles(colors);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { signInWithGoogle, signInWithEmail, signInWithPassword, signUpWithPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const card = (
    <View style={s.card}>
      {/* Značka */}
      <View style={s.brand}>
        <Image source={require('../../assets/logo.png')} style={{ width: 44, height: 44 }} contentFit="contain" />
        <Text style={s.appName}>{t('app.name')}</Text>
      </View>
      <Text style={s.subtitle}>{t('auth.subtitle')}</Text>

      {/* Google (dle standardu: světlé tlačítko, barevné G, text) */}
      <Pressable style={s.googleButton} onPress={() => signInWithGoogle()} accessibilityRole="button">
        <GoogleG size={18} />
        <Text style={s.googleText}>{t('auth.google')}</Text>
      </Pressable>

      <View style={s.divider}>
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
          style={[s.tab, { backgroundColor: mode === 'signin' ? colors.accent : colors.surface, borderColor: mode === 'signin' ? colors.accent : colors.border }]}
        >
          <Text style={{ color: mode === 'signin' ? colors.onAccent : colors.text, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>{t('auth.tabSignIn')}</Text>
        </Pressable>
        <Pressable
          onPress={() => { setMode('signup'); reset(); }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'signup' }}
          style={[s.tab, { backgroundColor: mode === 'signup' ? colors.accent : colors.surface, borderColor: mode === 'signup' ? colors.accent : colors.border }]}
        >
          <Text style={{ color: mode === 'signup' ? colors.onAccent : colors.text, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>{t('auth.tabSignUp')}</Text>
        </Pressable>
      </View>

      <TextInput
        value={email}
        onChangeText={(v) => { setEmail(v); reset(); }}
        placeholder={t('auth.emailPlaceholder')}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        style={s.input}
      />
      <TextInput
        value={password}
        onChangeText={(v) => { setPassword(v); reset(); }}
        placeholder={t('auth.password')}
        placeholderTextColor={colors.textFaint}
        secureTextEntry
        autoCapitalize="none"
        style={s.input}
      />
      {mode === 'signup' && (
        <TextInput
          value={confirm}
          onChangeText={(v) => { setConfirm(v); reset(); }}
          placeholder={t('auth.passwordConfirm')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          autoCapitalize="none"
          style={s.input}
        />
      )}

      <Pressable style={[s.primary, busy && s.disabled]} onPress={submitPassword} disabled={busy} accessibilityRole="button">
        <Text style={s.primaryText}>{mode === 'signin' ? t('auth.signIn') : t('auth.register')}</Text>
      </Pressable>

      <Pressable style={s.linkButton} onPress={sendMagicLink} disabled={busy} accessibilityRole="button">
        <Text style={s.linkText}>{t('auth.sendLink')}</Text>
      </Pressable>

      {notice && <Text style={s.notice}>{notice}</Text>}
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={wide ? s.row : undefined}>
          {wide && (
            <View style={s.side}>
              <Loading size={420} />
            </View>
          )}
          {card}
          {wide && (
            <View style={s.side}>
              <AvatarLottie mood="happy" size={420} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Patička */}
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
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl * 2 },
    side: { flex: 1, maxWidth: 480, alignItems: 'center', justifyContent: 'center' },
    card: { width: '100%', maxWidth: 400, gap: spacing.sm },
    brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    appName: { color: c.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
    subtitle: { color: c.textMuted, fontSize: fontSize.body, marginBottom: spacing.md },
    googleButton: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill },
    googleText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
    line: { flex: 1, height: 1, backgroundColor: c.border },
    or: { color: c.textFaint, fontSize: fontSize.caption },
    tabRow: { flexDirection: 'row', gap: spacing.sm },
    tab: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    input: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    primary: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
    primaryText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    disabled: { opacity: 0.5 },
    linkButton: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    notice: { color: c.accent, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xs },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
    footer: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: c.border, gap: spacing.xs, alignItems: 'center' },
    footerLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    footerLink: { color: c.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
    footerDot: { color: c.textFaint, fontSize: fontSize.caption },
    footerText: { color: c.textFaint, fontSize: fontSize.caption, textAlign: 'center' },
  });
