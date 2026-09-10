import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { Slot, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLanding } from '@/components/AuthLanding';
import { InstallPrompt } from '@/components/InstallPrompt';
import { Loading } from '@/components/Loading';
import { ResetPassword } from '@/components/ResetPassword';
import { Tooltip } from '@/components/Tooltip';
import { t } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LocaleProvider, useLocale } from '@/lib/locale';
import { NAV_ITEMS } from '@/lib/nav';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { brandLeaf, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme';
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
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovered || pinned;

  const items = [{ route: '/' as const, icon: 'home' as const, labelKey: 'home.dashboard' }, ...NAV_ITEMS];

  return (
    // V layoutu si rail rezervuje místo jen podle ukotvení – při pouhém hoveru
    // se obsah neposouvá, panel se rozbalí jako overlay nad obsahem.
    <View style={[{ position: 'relative', width: pinned ? RAIL_EXPANDED : RAIL_COLLAPSED, zIndex: 30 }, WIDTH_TRANSITION]}>
      <View
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
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
            accessibilityLabel={t(item.labelKey)}
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

      {/* Dole: ukotvení menu otevřeného / sbalení do úzkého pruhu */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pinned ? t('common.collapse') : t('common.pin')}
        onPress={() => setPinned((p) => !p)}
        style={{
          marginTop: 'auto',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginHorizontal: spacing.sm,
          paddingHorizontal: spacing.md,
          height: touchTarget,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Feather name={pinned ? 'chevrons-left' : 'chevrons-right'} size={22} color={colors.textMuted} />
        {expanded && (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>
            {pinned ? t('common.collapse') : t('common.pin')}
          </Text>
        )}
      </Pressable>
      </View>
    </View>
  );
}

function Header() {
  const { colors, mode, toggle } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const title = titleForPath(pathname);
  // Profilová fotka z Google OAuth (user_metadata.avatar_url / picture).
  const meta = session?.user.user_metadata as { custom_avatar?: string; avatar_url?: string; picture?: string } | undefined;
  const avatarUrl = meta?.custom_avatar ?? meta?.avatar_url ?? meta?.picture ?? null;

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

      {/* Vlevo: logo + název aplikace */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 28, height: 28 }}
          contentFit="contain"
          accessibilityLabel={t('app.name')}
        />
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
            accessibilityLabel={t('account.title')}
            onPress={() => router.push('/account')}
            style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} accessibilityLabel="avatar" />
            ) : (
              <Feather name="user" size={18} color={colors.textMuted} />
            )}
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
      <Text style={{ color: colors.textFaint, fontSize: fontSize.caption, textAlign: 'center' }}>{t('attribution.nutridb')}</Text>
    </View>
  );
}

function Shell() {
  const { colors } = useTheme();
  const { session } = useAuth();
  // Konzumace jazyka tady zajistí překreslení obsahu po přepnutí jazyka.
  useLocale();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/' && pathname !== '';
  // Recepty potřebují celou šířku (mřížka receptů 1/2/3 sloupce); obrazovka si
  // vstupní bloky drží ve své šířce sama. Ostatní obrazovky zůstávají na 960.
  const fullWidth = pathname === '/recipes';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <Header />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {session ? <Rail /> : null}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: fullWidth ? undefined : CONTENT_MAX_WIDTH }}>
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
  const { loading, session, recovery } = useAuth();
  const pathname = usePathname();
  // Právní stránky jsou veřejné (odkazy z patičky loginu), zbytek je za gatem.
  const publicRoute = pathname.startsWith('/legal');
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {loading ? (
        <Loading overlay />
      ) : recovery ? (
        <ResetPassword />
      ) : session || publicRoute ? (
        <Shell />
      ) : (
        <AuthLanding />
      )}
      <InstallPrompt />
    </>
  );
}

export default function RootLayout() {
  // PWA: doplň do <head> manifest + ikony/meta (web.output "single" nepoužívá
  // +html.tsx, tak je vkládáme za běhu) a zaregistruj service worker.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const head = document.head;
    const ensure = (selector: string, make: () => HTMLElement) => {
      if (!head.querySelector(selector)) head.appendChild(make());
    };
    const meta = (name: string, content: string) => {
      const m = document.createElement('meta');
      m.name = name;
      m.content = content;
      return m;
    };
    ensure('link[rel="manifest"]', () => {
      const l = document.createElement('link');
      l.rel = 'manifest';
      l.href = '/manifest.webmanifest';
      return l;
    });
    ensure('link[rel="apple-touch-icon"]', () => {
      const l = document.createElement('link');
      l.rel = 'apple-touch-icon';
      l.href = '/icons/apple-touch-icon.png';
      return l;
    });
    ensure('meta[name="theme-color"]', () => meta('theme-color', brandLeaf.accent));
    ensure('meta[name="mobile-web-app-capable"]', () => meta('mobile-web-app-capable', 'yes'));
    ensure('meta[name="apple-mobile-web-app-capable"]', () => meta('apple-mobile-web-app-capable', 'yes'));
    ensure('meta[name="apple-mobile-web-app-status-bar-style"]', () => meta('apple-mobile-web-app-status-bar-style', 'default'));
    ensure('meta[name="apple-mobile-web-app-title"]', () => meta('apple-mobile-web-app-title', 'Leafello'));

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

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
