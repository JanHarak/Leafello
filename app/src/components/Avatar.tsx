import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable } from 'react-native';
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

// Na webu react-native-web nepodporuje native driver; jinde ho využijeme.
const USE_NATIVE = Platform.OS !== 'web';

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

/**
 * Živý avatar: jemná opakující se „dýchací" animace (u nálady celebrating
 * navíc poskočí) a při kliknutí se vesele otřepe (rychlé zakývání).
 * Postavička je statické SVG, animuje se tedy celá jako celek.
 */
export function AnimatedAvatar({ mood, size = 140 }: { mood: Mood; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const period = mood === 'sleepy' ? 1600 : mood === 'celebrating' ? 650 : 1000;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: period, useNativeDriver: USE_NATIVE }),
        Animated.timing(scale, { toValue: 1.0, duration: period, useNativeDriver: USE_NATIVE }),
      ]),
    );
    pulse.start();

    let bounce: Animated.CompositeAnimation | undefined;
    if (mood === 'celebrating') {
      bounce = Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, { toValue: -12, duration: 320, useNativeDriver: USE_NATIVE }),
          Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: USE_NATIVE }),
        ]),
      );
      bounce.start();
    }

    return () => {
      pulse.stop();
      bounce?.stop();
      scale.setValue(1);
      translateY.setValue(0);
    };
  }, [mood, scale, translateY]);

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
      <Animated.View style={{ transform: [{ translateY }, { scale }, { rotate: rot }] }}>
        <Avatar mood={mood} size={size} />
      </Animated.View>
    </Pressable>
  );
}
