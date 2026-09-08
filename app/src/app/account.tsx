import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { deleteAccount, exportMyData } from '@/lib/db';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

/** Doručí JSON export: na webu jako stažený soubor, jinak přes systémové sdílení. */
async function deliverExport(filename: string, json: string, shareTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: shareTitle, message: json });
}

export default function Account() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);
  const { session } = useAuth();
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    if (!session || exporting) return;
    setExporting(true);
    setError(null);
    setExportMsg(null);
    try {
      const doc = await exportMyData(session.user.id, session.user.email ?? undefined);
      const json = JSON.stringify(doc, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      await deliverExport(`dietapp-export-${stamp}.json`, json, t('account.exportShareTitle'));
      setExportMsg(t('account.exportDone', { count: doc.meta.totalRows }));
    } catch (e) {
      console.error('Export dat selhal:', e);
      setError(t('account.error'));
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (!session || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      // Po odhlášení se stav auth vyprázdní; vrať uživatele na úvod.
      router.replace('/');
    } catch (e) {
      console.error('Smazání účtu selhalo:', e);
      setError(t('account.error'));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('account.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content}>
        {!session ? (
          <Text style={s.muted}>{t('account.needSignIn')}</Text>
        ) : (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('account.exportTitle')}</Text>
              <Text style={s.desc}>{t('account.exportDesc')}</Text>
              <Pressable style={[s.button, exporting && s.buttonDisabled]} onPress={onExport} disabled={exporting}>
                <Text style={s.buttonText}>{exporting ? t('account.exporting') : t('account.exportButton')}</Text>
              </Pressable>
              {exportMsg && <Text style={s.success}>{exportMsg}</Text>}
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>{t('account.deleteTitle')}</Text>
              <Text style={s.desc}>{t('account.deleteDesc')}</Text>
              {!confirming ? (
                <Pressable style={s.dangerButton} onPress={() => setConfirming(true)}>
                  <Text style={s.dangerText}>{t('account.deleteButton')}</Text>
                </Pressable>
              ) : (
                <View style={s.confirmBox}>
                  <Text style={s.confirmQuestion}>{t('account.deleteConfirmQuestion')}</Text>
                  <View style={s.confirmRow}>
                    <Pressable
                      style={[s.dangerButton, s.confirmFlex, deleting && s.buttonDisabled]}
                      onPress={onDelete}
                      disabled={deleting}
                    >
                      <Text style={s.dangerText}>{deleting ? t('account.deleting') : t('account.deleteConfirm')}</Text>
                    </Pressable>
                    {!deleting && (
                      <Pressable style={[s.button, s.confirmFlex]} onPress={() => setConfirming(false)}>
                        <Text style={s.buttonText}>{t('account.cancel')}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>

            {error && <Text style={s.error}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.lg },
    muted: { color: c.textFaint, fontSize: fontSize.body },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
    cardTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    desc: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    button: { minHeight: touchTarget, paddingHorizontal: spacing.xl, backgroundColor: c.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    dangerButton: { minHeight: touchTarget, paddingHorizontal: spacing.xl, borderWidth: 1, borderColor: c.notice, backgroundColor: c.noticeBackground, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: c.notice, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    confirmBox: { gap: spacing.md },
    confirmQuestion: { color: c.notice, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    confirmRow: { flexDirection: 'row', gap: spacing.sm },
    confirmFlex: { flex: 1 },
    success: { color: c.accent, fontSize: fontSize.body },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, fontSize: fontSize.body },
  });
