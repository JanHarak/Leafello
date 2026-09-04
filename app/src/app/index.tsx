import { useRouter } from 'expo-router';
import { useReducer } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  LANGUAGES,
  getLanguage,
  plural,
  setLanguage,
  t,
} from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  colorsFor,
  fontSize,
  fontWeight,
  radius,
  spacing,
  touchTarget,
} from '@/theme';

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = colorsFor(scheme);
  const router = useRouter();
  const { session, signOut } = useAuth();
  // i18n drží aktivní jazyk v modulu; tímhle překreslíme po přepnutí.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const activeLang = getLanguage();

  function switchLanguage(code: string) {
    setLanguage(code);
    rerender();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          {t('app.name')}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('home.subtitle')}
        </Text>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.body, { color: colors.text }]}>
            {t('home.stackNote')}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {t('home.phaseNote')}
          </Text>
          {/* Ukázka CLDR plurálu z i18n. */}
          <Text style={[styles.streak, { color: colors.accent }]}>
            {plural('streak.days', 3)}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/onboarding')}
          style={[styles.startButton, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.startText, { color: colors.onAccent }]}>{t('home.start')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/diary')}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.startText, { color: colors.text }]}>{t('diary.open')}</Text>
        </Pressable>

        {session ? (
          <View style={styles.authRow}>
            <Text style={[styles.authInfo, { color: colors.textFaint }]}>
              {t('auth.signedInAs', { email: session.user.email ?? '' })}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => signOut()}>
              <Text style={[styles.authAction, { color: colors.accent }]}>{t('auth.signOut')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/login')}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.startText, { color: colors.text }]}>{t('auth.signIn')}</Text>
          </Pressable>
        )}

        <Text style={[styles.label, { color: colors.textFaint }]}>
          {t('language.label')}
        </Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === activeLang;
            return (
              <Pressable
                key={lang.code}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => switchLanguage(lang.code)}
                style={[
                  styles.langButton,
                  {
                    backgroundColor: isActive ? colors.accent : colors.surface,
                    borderColor: isActive ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langText,
                    { color: isActive ? colors.onAccent : colors.text },
                  ]}
                >
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.spacer} />

        {/* N-07 / F-03: viditelná atribuce ODbL. */}
        <Text style={[styles.attribution, { color: colors.textFaint }]}>
          {t('attribution.off')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    flexGrow: 1,
  },
  eyebrow: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.regular,
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.5,
  },
  streak: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
  startButton: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  secondaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  startText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  authRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  authInfo: {
    fontSize: fontSize.caption,
    flexShrink: 1,
  },
  authAction: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  label: {
    marginTop: spacing.lg,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  langButton: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  langText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  spacer: {
    flex: 1,
    minHeight: spacing.xl,
  },
  attribution: {
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
});
