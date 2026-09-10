import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { brandLeaf, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme';

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
  const s = styles;
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
      <View style={s.headline}>
        <Feather name="download" size={24} color={brandLeaf.card} />
        <Text style={s.text}>{iosHint ? t('pwa.iosHint') : t('pwa.prompt')}</Text>
        <Pressable onPress={dismiss} style={s.close} accessibilityRole="button" accessibilityLabel={t('pwa.dismiss')} hitSlop={8}>
          <Feather name="x" size={22} color={brandLeaf.card} />
        </Pressable>
      </View>
      {!iosHint && (
        <Pressable onPress={install} style={s.install} accessibilityRole="button">
          <Text style={s.installText}>{t('pwa.install')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    zIndex: 100,
    gap: spacing.md,
    backgroundColor: brandLeaf.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: brandLeaf.ink,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, color: brandLeaf.card, fontSize: fontSize.body, fontWeight: fontWeight.medium, lineHeight: fontSize.body * 1.4 },
  close: { padding: spacing.xs },
  install: { minHeight: touchTarget, borderRadius: radius.pill, backgroundColor: brandLeaf.card, alignItems: 'center', justifyContent: 'center' },
  installText: { color: brandLeaf.accent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
});
