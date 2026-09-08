import type { Mood } from '@dietapp/gamification-rules';

import { Avatar } from '@/components/Avatar';

/**
 * Nativní fallback: dokud nepřidáme lottie-react-native, ukáže statický art.
 * (Web používá LottiePlayer.tsx s lottie-react.)
 */
export function LottiePlayer({ size, mood }: { source: unknown; size: number; mood: Mood }) {
  return <Avatar mood={mood} size={size} />;
}
