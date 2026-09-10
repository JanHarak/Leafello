/**
 * Nativní náhrada: skenování čárového kódu je zatím jen webová funkce (ZXing).
 * Na iOS/Android se nic nevykreslí; sekce Fotka tam nabídne ruční zadání kódu.
 */
export function BarcodeScanner(_props: { onDetected: (code: string) => void; onError?: (message: string) => void }) {
  return null;
}
