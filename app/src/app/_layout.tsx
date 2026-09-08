import Feather from '@expo/vector-icons/Feather';
import { Slot, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tooltip } from '@/components/Tooltip';
import { t } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LocaleProvider, useLocale } from '@/lib/locale';
import { NAV_ITEMS } from '@/lib/nav';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme';
import '@/global.css';

// react-native-web umí CSS přechody; na nativu se ignorují (mobil řešíme později).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WIDTH_TRANSITION: any = Platform.OS === 'web' ? { transitionProperty: 'width', transitionDuration: '180ms', transitionTimingFunction: 'ease' } : null;

const RAIL_COLLAPSED = 64;
const RAIL_EXPANDED = 210;
const HEADER_HEIGHT = 60;
const CONTENT_MAX_WIDTH = 960;

function titleForPath(path: string): string {
  if (path === '/' || path === '') return '';
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
      style={[
        {
          width: expanded ? RAIL_EXPANDED : RAIL_COLLAPSED,
          backgroundColor: colors.surface,
          borderRightWidth: 1,
          borderRightColor: colors.border,
          paddingVertical: spacing.md,
          gap: spacing.xs,
          overflow: 'hidden',
        },
        WIDTH_TRANSITION,
      ]}
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

function Header() {
  const { colors, mode, toggle } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const title = titleForPath(pathname);

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
      {/* Střed: název sekce, vycentrovaný nezávisle na šířce postranních bloků */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {title !== '' && (
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold }}>
            {title}
          </Text>
        )}
      </View>

      {/* Vlevo: název aplikace */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold }}>
          {t('app.name')}
        </Text>
      </View>

      {/* Vpravo: téma a uživatel */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          onPress={toggle}
          style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill }}
        >
          <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={20} color={colors.textMuted} />
        </Pressable>

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

function Footer() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/legal/privacy')}>
          <Text style={{ color: colors.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{t('legal.privacy')}</Text>
        </Pressable>
        <Text style={{ color: colors.textFaint, fontSize: fontSize.caption }}>·</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/legal/terms')}>
          <Text style={{ color: colors.accent, fontSize: fontSize.caption, fontWeight: fontWeight.medium }}>{t('legal.terms')}</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.textFaint, fontSize: fontSize.caption, textAlign: 'center' }}>{t('attribution.off')}</Text>
    </View>
  );
}

function Shell() {
  const { colors } = useTheme();
  // Konzumace jazyka tady zajistí překreslení obsahu po přepnutí jazyka.
  useLocale();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/' && pathname !== '';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <Header />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Rail />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH }}>
            {showBack && (
              <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'flex-start' }}>
                <Tooltip
                  label={t('common.back')}
                  onPress={goBack}
                  style={{ width: touchTarget, height: touchTarget, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Feather name="arrow-left" size={20} color={colors.text} />
                </Tooltip>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Slot />
            </View>
          </View>
        </View>
      </View>
      <Footer />
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
