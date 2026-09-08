import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

export interface WeightPoint {
  /** Den v měsíci 1..daysInMonth. */
  day: number;
  kg: number;
}

/**
 * Graf vývoje váhy za celý měsíc. Osa X = dny v měsíci, osa Y = pevný rozsah
 * (typicky zadaná váha ±10 kg). Zelená vodorovná čára značí cílovou váhu.
 * Šířku měří přes onLayout (responzivní).
 */
export function WeightChart({
  points,
  daysInMonth,
  yMin,
  yMax,
  targetKg,
  color,
  gridColor,
  targetColor,
  height = 200,
}: {
  points: WeightPoint[];
  daysInMonth: number;
  yMin: number;
  yMax: number;
  targetKg?: number | null;
  color: string;
  gridColor: string;
  targetColor: string;
  height?: number;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const padX = 12;
  const padY = 16;
  const span = yMax - yMin || 1;

  const x = (day: number) => padX + ((day - 1) / Math.max(1, daysInMonth - 1)) * (w - 2 * padX);
  const y = (kg: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, kg));
    return padY + (1 - (clamped - yMin) / span) * (height - 2 * padY);
  };

  const sorted = [...points].sort((a, b) => a.day - b.day);
  const polyline = sorted.map((p) => `${x(p.day)},${y(p.kg)}`).join(' ');
  const targetInRange = typeof targetKg === 'number' && targetKg >= yMin && targetKg <= yMax;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {/* Horní a dolní hranice rozsahu */}
          <Line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke={gridColor} strokeWidth={1} />
          <Line x1={padX} y1={height - padY} x2={w - padX} y2={height - padY} stroke={gridColor} strokeWidth={1} />
          {/* Cílová váha – zelená referenční čára */}
          {targetInRange && (
            <Line x1={padX} y1={y(targetKg as number)} x2={w - padX} y2={y(targetKg as number)} stroke={targetColor} strokeWidth={2} strokeDasharray="6 5" />
          )}
          {sorted.length > 1 && (
            <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {sorted.map((p) => (
            <Circle key={p.day} cx={x(p.day)} cy={y(p.kg)} r={3.5} fill={color} />
          ))}
        </Svg>
      )}
    </View>
  );
}
