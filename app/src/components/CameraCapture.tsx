import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

/**
 * Web fotoaparát přes getUserMedia: živý náhled zadní kamery + spoušť, která
 * vyfotí aktuální snímek do canvasu a vrátí ho jako objectURL (`onCapture`).
 * Spolehlivě spustí kameru i na desktopu i na mobilním webu (na rozdíl od
 * <input capture>). Nativní náhrada je v CameraCapture.native.tsx.
 */
export function CameraCapture({
  onCapture,
  onCancel,
  onError,
}: {
  onCapture: (uri: string) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        onErrorRef.current?.(e instanceof Error ? e.message : 'camera');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <View style={s.wrap}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: radius.lg }} />
      <View style={s.row}>
        <Pressable style={s.shoot} onPress={shoot} accessibilityRole="button">
          <Feather name="camera" size={20} color={colors.onAccent} />
          <Text style={s.shootText}>{t('photo.takePhoto')}</Text>
        </Pressable>
        <Pressable style={s.cancel} onPress={onCancel} accessibilityRole="button">
          <Text style={s.cancelText}>{t('barcode.stop')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm },
    shoot: { flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: touchTarget * 1.2, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    shootText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    cancel: { minHeight: touchTarget * 1.2, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    cancelText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
  });
