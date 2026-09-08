import Lottie from 'lottie-react';
import type { Mood } from '@dietapp/gamification-rules';

/**
 * Web přehrávač Lottie (lottie-react 2.x). Na nativu se použije
 * LottiePlayer.native.tsx. `source` je animationData (JSON přes require).
 * Ve výchozím stavu se přehrává ve smyčce.
 */
export function LottiePlayer({ source, size }: { source: unknown; size: number; mood: Mood }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Lottie animationData={source as any} loop autoplay style={{ width: size, height: size }} />;
}
