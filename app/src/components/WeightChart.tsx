import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

export interface WeightPoint {
  date: string;
  kg: number;
}

/**
 * Jednoduchý čárový graf vývoje váhy po dnech. Neutrální barvy (jen accent),
 * nehodnotí trend. Šířku měří přes onLayout, aby byl responzivní.
 */
export function WeightChart({
  points,
  color,
  gridColor,
  height = 160,
}: {
  points: WeightPoint[];
  color: string;
  gridColor: string;
  height?: number;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const padX = 10;
  const padY = 16;
  const kgs = points.map((p) => p.kg);
  const min = kgs.length ? Math.min(...kgs) : 0;
  const max = kgs.length ? Math.max(...kgs) : 1;
  const span = max - min || 1;
  const n = points.length;

  const flat = max === min;
  const x = (i: number) => (n <= 1 ? w / 2 : padX + (i / (n - 1)) * (w - 2 * padX));
  const y = (kg: number) => (flat ? height / 2 : padY + (1 - (kg - min) / span) * (height - 2 * padY));
  const polyline = points.map((p, i) => `${x(i)},${y(p.kg)}`).join(' ');

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && n > 0 && (
        <Svg width={w} height={height}>
          {/* Vodicí čáry: horní (max) a dolní (min) */}
          <Line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke={gridColor} strokeWidth={1} />
          <Line x1={padX} y1={height - padY} x2={w - padX} y2={height - padY} stroke={gridColor} strokeWidth={1} />
          {n > 1 && <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => (
            <Circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.kg)} r={3} fill={color} />
          ))}
        </Svg>
      )}
    </View>
  );
}
