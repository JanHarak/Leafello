import type { Mood } from '@dietapp/gamification-rules';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme';

/**
 * Animovaná postavička kreslená přímo v SVG, takže se animují její RYSY:
 * pravidelné mrkání, opakující se rozšíření úsměvu a jemné „dýchání".
 * Kliknutím se vesele otřepe. Nálada mění výraz (šířku úsměvu, u sleepy
 * přivřené oči, u celebrating jiskřičky). Barvy jdou z tématu.
 */
const USE_NATIVE = Platform.OS !== 'web';
const AEllipse = Animated.createAnimatedComponent(Ellipse);
const APath = Animated.createAnimatedComponent(Path);

export function AnimatedFace({ mood, size = 160 }: { mood: Mood; size?: number }) {
  const { colors } = useTheme();

  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current; // 1 = otevřené oči, 0 = zavřené
  const smile = useRef(new Animated.Value(0)).current; // 0 = základní úsměv, 1 = široký

  const sleepy = mood === 'sleepy';
  const celebrating = mood === 'celebrating';

  useEffect(() => {
    const period = sleepy ? 1600 : celebrating ? 650 : 1000;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: period, useNativeDriver: USE_NATIVE }),
        Animated.timing(scale, { toValue: 1, duration: period, useNativeDriver: USE_NATIVE }),
      ]),
    );
    pulse.start();

    // Úsměv se opakovaně rozšiřuje a vrací.
    const smiling = Animated.loop(
      Animated.sequence([
        Animated.timing(smile, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(smile, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ]),
    );
    smiling.start();

    // Mrkání (u sleepy oči zůstávají přivřené).
    let blinking: Animated.CompositeAnimation | undefined;
    if (sleepy) {
      blink.setValue(0.18);
    } else {
      blink.setValue(1);
      blinking = Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: 1, duration: 2600, useNativeDriver: false }),
          Animated.timing(blink, { toValue: 0.05, duration: 80, useNativeDriver: false }),
          Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: false }),
        ]),
      );
      blinking.start();
    }

    let bounce: Animated.CompositeAnimation | undefined;
    if (celebrating) {
      bounce = Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, { toValue: -10, duration: 320, useNativeDriver: USE_NATIVE }),
          Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: USE_NATIVE }),
        ]),
      );
      bounce.start();
    }

    return () => {
      pulse.stop();
      smiling.stop();
      blinking?.stop();
      bounce?.stop();
      scale.setValue(1);
      translateY.setValue(0);
    };
  }, [mood, sleepy, celebrating, scale, translateY, blink, smile]);

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
  const eyeRy = blink.interpolate({ inputRange: [0, 1], outputRange: [0.8, 6] });
  const wideOpacity = smile; // široký úsměv se prolíná se základním
  const baseOpacity = smile.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable onPress={wiggle} accessibilityRole="button" accessibilityLabel={`avatar-${mood}`}>
      <Animated.View style={{ width: size, height: size, transform: [{ translateY }, { scale }, { rotate: rot }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {/* Tělo */}
          <Circle cx={50} cy={52} r={40} fill={colors.accent} />
          {/* Tváře */}
          <Ellipse cx={30} cy={60} rx={6} ry={4} fill={colors.macroFat} opacity={0.55} />
          <Ellipse cx={70} cy={60} rx={6} ry={4} fill={colors.macroFat} opacity={0.55} />
          {/* Oči (mrkání přes ry) */}
          <AEllipse cx={38} cy={47} rx={5} ry={eyeRy} fill={colors.onAccent} />
          <AEllipse cx={62} cy={47} rx={5} ry={eyeRy} fill={colors.onAccent} />
          {/* Ústa: základní a široký úsměv se prolínají */}
          <APath
            d={celebrating ? 'M38 62 Q50 76 62 62' : 'M40 63 Q50 70 60 63'}
            stroke={colors.onAccent}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={baseOpacity}
          />
          <APath
            d={celebrating ? 'M35 61 Q50 82 65 61' : 'M37 62 Q50 76 63 62'}
            stroke={colors.onAccent}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={wideOpacity}
          />
          {/* Jiskřičky u oslavy */}
          {celebrating && (
            <G>
              <Path d="M14 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill={colors.macroCarbs} />
              <Path d="M84 20 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 z" fill={colors.macroCarbs} />
            </G>
          )}
          {/* Kapka u žízně */}
          {mood === 'thirsty' && <Path d="M78 40 q4 6 0 9 q-4 -3 0 -9 z" fill={colors.ringWater} />}
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
