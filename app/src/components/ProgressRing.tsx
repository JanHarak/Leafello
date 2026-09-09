import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * Kruhový ukazatel postupu. Neutrální – barva je jen značková (accent),
 * nikdy nehodnotí (pravidlo 6). `progress` je 0 až 1, přetečení se ořízne.
 * Při načtení (a při změně cíle) se prstenec plynule „naplní".
 *
 * Animace jede přes requestAnimationFrame do stavu a vykresluje se obyčejný
 * <Circle>. Záměrně NEpoužíváme Animated.createAnimatedComponent(Circle):
 * ten na webu prosakuje interní prop `collapsable` do DOM (react-native-svg),
 * což hází React warning.
 */
export function ProgressRing({
  size = 140,
  strokeWidth = 12,
  progress,
  color,
  trackColor,
  children,
}: {
  size?: number;
  strokeWidth?: number;
  progress: number;
  color: string;
  trackColor: string;
  children?: ReactNode;
}) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  // Vykreslený podíl (0..1). Na mountu se rozjede z nuly, při změně cíle
  // dojede z aktuální hodnoty na novou.
  const shownRef = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const from = shownRef.current;
    const to = p;
    const start = Date.now();
    const duration = 900;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const v = from + (to - from) * easeOutCubic(t);
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p]);

  const offset = c * (1 - shown);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}
