import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef } from 'react';

import { radius } from '@/theme';

/**
 * Web skener čárového kódu (ZXing). Otevře zadní kameru přes getUserMedia,
 * dekóduje EAN/UPC ve smyčce a při prvním nálezu zavolá `onDetected` a stream
 * zavře. Chyby (odepřená/chybějící kamera) hlásí přes `onError`. Renderuje se
 * jen na webu; na nativu je náhrada v BarcodeScanner.native.tsx.
 */
export function BarcodeScanner({
  onDetected,
  onError,
}: {
  onDetected: (code: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Callbacky přes ref, ať efekt běží jen jednou (kamera se nerestartuje).
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);
  onDetectedRef.current = onDetected;
  onErrorRef.current = onError;

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let done = false;
    const reader = new BrowserMultiFormatReader();
    (async () => {
      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, ctrl) => {
          if (result && !done) {
            done = true;
            ctrl.stop();
            onDetectedRef.current(result.getText());
          }
        });
      } catch (e) {
        onErrorRef.current?.(e instanceof Error ? e.message : 'camera');
      }
    })();
    return () => {
      done = true;
      controls?.stop();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: radius.lg }}
    />
  );
}
