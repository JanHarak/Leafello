import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

/** Událost beforeinstallprompt (Chrome/Android) – v TS typech chybí. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'leafello_pwa_dismissed';

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mm) || iosStandalone;
}

/**
 * Nabídka instalace PWA na mobilu. Na Androidu/Chrome chytá `beforeinstallprompt`
 * a nabídne tlačítko „Nainstalovat"; na iOS (bez té události) zobrazí návod
 * „Přidat na plochu". Odmítnutí si pamatuje v localStorage. Jen web + mobil.
 */
export function InstallPrompt() {
  const { colors } = useTheme();
  const s = styles(colors);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // localStorage nedostupné – ignoruj
    }
    if (dismissed || !isMobileUA() || isStandalone()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS Safari nepodporuje beforeinstallprompt → rovnou ukaž návod.
    if (isIos()) {
      setIosHint(true);
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignoruj
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    dismiss();
  }

  if (!show) return null;

  return (
    <View style={s.bar}>
      <Text style={s.text}>{iosHint ? t('pwa.iosHint') : t('pwa.prompt')}</Text>
      <View style={s.actions}>
        {!iosHint && (
          <Pressable onPress={install} style={s.install} accessibilityRole="button">
            <Text style={s.installText}>{t('pwa.install')}</Text>
          </Pressable>
        )}
        <Pressable onPress={dismiss} style={s.close} accessibilityRole="button">
          <Text style={s.closeText}>{t('pwa.dismiss')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.md,
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      backgroundColor: c.surfaceElevated,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      shadowColor: c.text,
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    text: { flex: 1, color: c.text, fontSize: fontSize.caption, lineHeight: fontSize.caption * 1.4 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    install: { minHeight: touchTarget, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    installText: { color: c.onAccent, fontSize: fontSize.caption, fontWeight: fontWeight.bold },
    close: { minHeight: touchTarget, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: c.textMuted, fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  });
