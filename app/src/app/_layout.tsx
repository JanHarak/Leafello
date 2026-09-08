import Feather from '@expo/vector-icons/Feather';
import { Slot, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUAGES, t } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LocaleProvider, useLocale } from '@/lib/locale';
import { NAV_ITEMS } from '@/lib/nav';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme';
import '@/global.css';

const RAIL_COLLAPSED = 64;
const RAIL_EXPANDED = 210;
const HEADER_HEIGHT = 60;
const CONTENT_MAX_WIDTH = 960;

function titleForPath(path: string): string {
  if (path === '/' || path === '') return t('app.name');
  const nav = NAV_ITEMS.find((n) => n.route === path);
  if (nav) return t(nav.labelKey);
  if (path.startsWith('/account')) return t('account.title');
  if (path.startsWith('/login')) return t('auth.title');
  if (path.startsWith('/onboarding')) return t('onboarding.title');
  if (path.startsWith('/legal/privacy')) return t('legal.privacy');
  if (path.startsWith('/legal/terms')) return t('legal.terms');
  return t('app.name');
}

function Rail() {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  const items = [{ route: '/' as const, icon: 'home' as const, labelKey: 'home.today' }, ...NAV_ITEMS];

  return (
    <View
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => setExpanded(false)}
      style={{
        width: expanded ? RAIL_EXPANDED : RAIL_COLLAPSED,
        backgroundColor: colors.surface,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        paddingVertical: spacing.md,
        gap: spacing.xs,
      }}
    >
      {items.map((item) => {
        const active = pathname === item.route;
        return (
          <Pressable
            key={String(item.route)}
            accessibilityRole="button"
            onPress={() => router.push(item.route)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginHorizontal: spacing.sm,
              paddingHorizontal: spacing.md,
              height: touchTarget,
              borderRadius: radius.md,
              backgroundColor: active ? colors.accent : 'transparent',
            }}
          >
            <Feather name={item.icon} size={22} color={active ? colors.onAccent : colors.textMuted} />
            {expanded && (
              <Text numberOfLines={1} style={{ color: active ? colors.onAccent : colors.text, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>
                {t(item.labelKey)}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function LanguageSwitch() {
  const { colors } = useTheme();
  const { lang, setLang } = useLocale();
  return (
    <View style={{ flexDirection: 'row', gap: 2, backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, padding: 3 }}>
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <Pressable
            key={l.code}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setLang(l.code)}
            style={{ paddingHorizontal: spacing.sm, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.accent : 'transparent' }}
          >
            <Text style={{ color: active ? colors.onAccent : colors.textMuted, fontSize: fontSize.caption, fontWeight: fontWeight.bold }}>
              {l.code.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Header() {
  const { colors, mode, toggle } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View
      style={{
        height: HEADER_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold }}>
          {titleForPath(pathname)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          onPress={toggle}
          style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill }}
        >
          <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={20} color={colors.textMuted} />
        </Pressable>

        <LanguageSwitch />

        {session ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/account')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}
          >
            <Feather name="user" size={18} color={colors.textMuted} />
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium, maxWidth: 160 }}>
              {session.user.email ?? t('account.title')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/login')}
            style={{ height: touchTarget, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.onAccent, fontSize: fontSize.caption, fontWeight: fontWeight.bold }}>{t('auth.signIn')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Shell() {
  const { colors } = useTheme();
  // Konzumace jazyka tady zajistí překreslení obsahu po přepnutí jazyka.
  useLocale();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <Header />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Rail />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH }}>
            <Slot />
          </View>
        </View>
      </View>
    </View>
  );
}

function ThemedRoot() {
  const { mode } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Shell />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <SafeAreaProvider>
            <ThemedRoot />
          </SafeAreaProvider>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
