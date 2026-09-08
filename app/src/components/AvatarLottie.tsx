import type { Mood } from '@dietapp/gamification-rules';
import { useRef } from 'react';
import { Animated, Platform, Pressable } from 'react-native';

import { AnimatedAvatar } from '@/components/Avatar';
import { LottiePlayer } from '@/components/LottiePlayer';

// Lottie animace podle nálady. Zatím jen happy; ostatní nálady spadnou na
// původní animovaný art (AnimatedAvatar).
const SOURCES: Partial<Record<Mood, unknown>> = {
  happy: require('../../assets/avatar/animated/avatar-happy.json'),
};

const USE_NATIVE = Platform.OS !== 'web';

/**
 * Avatar s Lottie animací (idle běží uvnitř Lottie), kliknutí spustí veselé
 * otřepání. Pro nálady bez Lottie souboru se použije původní animovaný art.
 */
export function AvatarLottie({ mood, size = 160 }: { mood: Mood; size?: number }) {
  const src = SOURCES[mood];
  const rotate = useRef(new Animated.Value(0)).current;

  if (!src) return <AnimatedAvatar mood={mood} size={size} />;

  function wiggle() {
    rotate.stopAnimation();
    rotate.setValue(0);
    Animated.sequence([
      Animated.timing(rotate, { toValue: 1, duration: 70, useNativeDriver: USE_NATIVE }),
      Animated.timing(rotate, { toValue: -1, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.timing(rotate, { toValue: 0.7, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.timing(rotate, { toValue: -0.5, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.timing(rotate, { toValue: 0, duration: 90, useNativeDriver: USE_NATIVE }),
    ]).start();
  }

  const rot = rotate.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });

  return (
    <Pressable onPress={wiggle} accessibilityRole="button" accessibilityLabel={`avatar-${mood}`}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate: rot }] }}>
        <LottiePlayer source={src} mood={mood} size={size} />
      </Animated.View>
    </Pressable>
  );
}
