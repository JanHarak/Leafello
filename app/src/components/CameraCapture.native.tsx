/**
 * Nativní náhrada: na iOS/Android se fotí přes expo-image-picker
 * (launchCameraAsync přímo v obrazovce Fotka), tuto web komponentu netřeba.
 */
export function CameraCapture(_props: {
  onCapture: (uri: string) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}) {
  return null;
}
