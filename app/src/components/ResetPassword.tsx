import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Loading } from '@/components/Loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { brandLeaf, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme';

/**
 * Obrazovka pro nastavení nového hesla po kliknutí na odkaz „obnova hesla".
 * Zobrazí se, když je v AuthProvider aktivní `recovery` (dočasná session ze
 * Supabase). Po uložení hesla se recovery vymaže a aplikace pokračuje dál.
 */
export function ResetPassword() {
  const s = styles;
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (password.length < 6) return setError(t('auth.errorPassword'));
    if (password !== confirm) return setError(t('auth.errorPasswordMatch'));
    setBusy(true);
    try {
      await updatePassword(password);
    } catch {
      setError(t('auth.errorSignUp'));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.card}>
        <Loading size={72} />
        <Text style={s.title}>{t('auth.resetTitle')}</Text>
        <Text style={s.subtitle}>{t('auth.resetSubtitle')}</Text>

        <View style={s.field}>
          <Feather name="lock" size={18} color={brandLeaf.inkSoft} />
          <TextInput
            value={password}
            onChangeText={(v) => { setPassword(v); setError(null); }}
            placeholder={t('auth.newPassword')}
            placeholderTextColor={brandLeaf.inkSoft}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            style={s.fieldInput}
          />
          <Pressable onPress={() => setShowPw((v) => !v)} accessibilityRole="button" hitSlop={8}>
            <Feather name={showPw ? 'eye' : 'eye-off'} size={18} color={brandLeaf.inkSoft} />
          </Pressable>
        </View>

        <View style={s.field}>
          <Feather name="lock" size={18} color={brandLeaf.inkSoft} />
          <TextInput
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setError(null); }}
            placeholder={t('auth.passwordConfirm')}
            placeholderTextColor={brandLeaf.inkSoft}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            style={s.fieldInput}
          />
        </View>

        <Pressable style={[s.primary, busy && s.disabled]} onPress={submit} disabled={busy} accessibilityRole="button">
          <Text style={s.primaryText}>{t('auth.savePassword')}</Text>
        </Pressable>

        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brandLeaf.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 440, backgroundColor: brandLeaf.card, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, alignItems: 'stretch', shadowColor: brandLeaf.ink, shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 4 },
  title: { color: brandLeaf.ink, fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: 'center' },
  subtitle: { color: brandLeaf.inkSoft, fontSize: fontSize.body, textAlign: 'center', lineHeight: fontSize.body * 1.5, marginBottom: spacing.sm },
  field: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: brandLeaf.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: brandLeaf.field },
  fieldInput: { flex: 1, color: brandLeaf.ink, fontSize: fontSize.body },
  primary: { minHeight: touchTarget, backgroundColor: brandLeaf.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  primaryText: { color: brandLeaf.card, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  disabled: { opacity: 0.5 },
  error: { color: brandLeaf.error, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xs },
});
