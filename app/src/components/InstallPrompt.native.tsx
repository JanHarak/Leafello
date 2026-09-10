/**
 * Nativní fallback: instalace PWA je jen webová záležitost, na iOS/Android
 * (nativní appce) se nic nezobrazuje.
 */
export function InstallPrompt() {
  return null;
}
