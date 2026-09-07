import { Image } from 'expo-image';
import type { Mood } from '@dietapp/gamification-rules';

// Placeholder SVG sada nálad (nahradí finální art / Rive). Statické require,
// aby je Metro zabalil jako assety (vrací číselné asset id).
const SOURCES: Record<Mood, number> = {
  happy: require('../../assets/avatar/happy.svg') as number,
  hungry: require('../../assets/avatar/hungry.svg') as number,
  thirsty: require('../../assets/avatar/thirsty.svg') as number,
  sleepy: require('../../assets/avatar/sleepy.svg') as number,
  celebrating: require('../../assets/avatar/celebrating.svg') as number,
};

export function Avatar({ mood, size = 140 }: { mood: Mood; size?: number }) {
  return (
    <Image
      source={SOURCES[mood]}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel={`avatar-${mood}`}
    />
  );
}
