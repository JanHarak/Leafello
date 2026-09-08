import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

export interface WeightPoint {
  /** Den v měsíci 1..daysInMonth. */
  day: number;
  kg: number;
}

/**
 * Graf vývoje váhy za celý měsíc. Osa X = dny v měsíci (číselné popisky),
 * osa Y = pevný rozsah v kg (popisky po 5 kg). Zelená vodorovná čára značí
 * cílovou váhu. Šířku měří přes onLayout (responzivní).
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
  textColor,
  height = 220,
}: {
  points: WeightPoint[];
  daysInMonth: number;
  yMin: number;
  yMax: number;
  targetKg?: number | null;
  color: string;
  gridColor: string;
  targetColor: string;
  textColor: string;
  height?: number;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const span = yMax - yMin || 1;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = height - padT - padB;

  const x = (day: number) => padL + ((day - 1) / Math.max(1, daysInMonth - 1)) * plotW;
  const y = (kg: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, kg));
    return padT + (1 - (clamped - yMin) / span) * plotH;
  };

  // Popisky osy Y po 5 kg.
  const yTicks: number[] = [];
  for (let kg = yMin; kg <= yMax + 0.001; kg += 5) yTicks.push(Math.round(kg));

  // Popisky osy X: 1., pak po 5 dnech, a poslední den.
  const xTicks: number[] = [1];
  for (let d = 5; d < daysInMonth; d += 5) xTicks.push(d);
  if (xTicks[xTicks.length - 1] !== daysInMonth) xTicks.push(daysInMonth);

  const sorted = [...points].sort((a, b) => a.day - b.day);
  const polyline = sorted.map((p) => `${x(p.day)},${y(p.kg)}`).join(' ');
  const targetInRange = typeof targetKg === 'number' && targetKg >= yMin && targetKg <= yMax;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {/* Vodorovné mřížky + popisky kg */}
          {yTicks.map((kg) => (
            <Line key={`g${kg}`} x1={padL} y1={y(kg)} x2={w - padR} y2={y(kg)} stroke={gridColor} strokeWidth={1} />
          ))}
          {yTicks.map((kg) => (
            <SvgText key={`yt${kg}`} x={padL - 6} y={y(kg) + 4} fontSize={11} fill={textColor} textAnchor="end">
              {kg}
            </SvgText>
          ))}
          {/* Popisky dnů na ose X */}
          {xTicks.map((d) => (
            <SvgText key={`xt${d}`} x={x(d)} y={height - 6} fontSize={11} fill={textColor} textAnchor="middle">
              {d}
            </SvgText>
          ))}
          {/* Cílová váha – zelená referenční čára */}
          {targetInRange && (
            <Line x1={padL} y1={y(targetKg as number)} x2={w - padR} y2={y(targetKg as number)} stroke={targetColor} strokeWidth={2} strokeDasharray="6 5" />
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
