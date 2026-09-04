import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { t } from '@/i18n';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

export default function Login() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);
  const router = useRouter();
  const { signInWithGoogle, signInWithEmail, session } = useAuth();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Po přihlášení (změna session) zpět na úvod.
  if (session) {
    router.replace('/');
  }

  async function sendLink() {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch {
      setError(t('auth.invalidEmail'));
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('auth.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <View style={s.content}>
        <Text style={s.title}>{t('auth.title')}</Text>
        <Text style={s.subtitle}>{t('auth.subtitle')}</Text>

        <Pressable style={s.googleButton} onPress={() => signInWithGoogle()}>
          <Text style={s.googleText}>{t('auth.google')}</Text>
        </Pressable>

        <Text style={s.or}>{t('auth.or')}</Text>

        <TextInput
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setSent(false);
          }}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          style={s.input}
        />

        {sent ? (
          <Text style={s.sent}>{t('auth.linkSent')}</Text>
        ) : (
          <Pressable style={s.linkButton} onPress={sendLink}>
            <Text style={s.linkText}>{t('auth.sendLink')}</Text>
          </Pressable>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center' },
    title: { color: c.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
    subtitle: { color: c.textMuted, fontSize: fontSize.body, marginBottom: spacing.md },
    googleButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    googleText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    or: { color: c.textFaint, textAlign: 'center', fontSize: fontSize.caption, marginVertical: spacing.xs },
    input: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body },
    linkButton: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    sent: { color: c.accent, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.sm },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
