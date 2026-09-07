import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ageFromBirthDate,
  assertTargetWeight,
  bmr,
  kcalTarget,
  macros,
  tdee,
  waterMl,
  HeightOutOfRange,
  InvalidBirthDate,
  RateOutOfRange,
  TargetWeightUnsafe,
  type ActivityLevel,
  type Sex,
} from '@dietapp/nutrition-calc';

import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { saveProfileAndGoal } from '@/lib/db';
import { colorsFor, fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'high', 'very_high'];
const RATES = [0, 0.25, 0.5, 0.75, 1];

interface GoalResult {
  kcalTarget: number;
  warning: 'rate_not_safe' | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  water: number;
}

export default function Onboarding() {
  const colors = colorsFor(useColorScheme());
  const s = styles(colors);

  const [sex, setSex] = useState<Sex>('female');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('sedentary');
  const [rate, setRate] = useState(0.5);

  const { session } = useAuth();
  const [goal, setGoal] = useState<GoalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function compute() {
    const heightCm = Number(height);
    const weightKg = Number(weight);
    const targetKg = Number(targetWeight);
    if (!birthDate || !height || !weight || !targetWeight || Number.isNaN(heightCm) || Number.isNaN(weightKg) || Number.isNaN(targetKg)) {
      setGoal(null);
      setError(t('onboarding.errorRequired'));
      return;
    }
    try {
      const age = ageFromBirthDate(birthDate);
      const base = bmr({ sex, weightKg, heightCm, age });
      assertTargetWeight(targetKg, heightCm);
      const kc = kcalTarget({ tdee: tdee(base, activity), ratePerWeek: rate, sex });
      const m = macros({ kcalTarget: kc.kcalTarget, weightKg });
      const result: GoalResult = { kcalTarget: kc.kcalTarget, warning: kc.warning, ...m, water: waterMl(weightKg) };
      setGoal(result);
      setError(null);
      setSaved(false);
      // Uložit do účtu, pokud je uživatel přihlášený.
      if (session) {
        try {
          await saveProfileAndGoal(
            session.user.id,
            { sex, birthDate, heightCm, activity },
            {
              targetWeightKg: targetKg,
              ratePerWeek: rate,
              kcalTarget: result.kcalTarget,
              proteinG: result.proteinG,
              carbsG: result.carbsG,
              fatG: result.fatG,
              waterMl: result.water,
            },
          );
          setSaved(true);
        } catch {
          setSaved(false);
        }
      }
    } catch (e) {
      setGoal(null);
      if (e instanceof InvalidBirthDate) setError(t('onboarding.errorBirthDate'));
      else if (e instanceof HeightOutOfRange) setError(t('onboarding.errorHeight'));
      else if (e instanceof RateOutOfRange) setError(t('onboarding.errorRate'));
      else if (e instanceof TargetWeightUnsafe) {
        setError(t('onboarding.errorTargetWeight', { weight: e.lowestAcceptableWeightKg }));
      } else setError(t('onboarding.errorRequired'));
    }
  }

  if (goal) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: t('goal.title'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.title}>{t('goal.title')}</Text>

          <View style={s.goalCard}>
            <Text style={s.kcalValue}>
              {goal.kcalTarget} <Text style={s.kcalUnit}>{t('goal.unitKcal')}</Text>
            </Text>
            <View style={s.macroRow}>
              <Macro label={t('goal.protein')} value={`${goal.proteinG} ${t('goal.unitG')}`} c={colors} />
              <Macro label={t('goal.carbs')} value={`${goal.carbsG} ${t('goal.unitG')}`} c={colors} />
              <Macro label={t('goal.fat')} value={`${goal.fatG} ${t('goal.unitG')}`} c={colors} />
            </View>
            <View style={s.waterRow}>
              <Text style={s.waterLabel}>{t('goal.water')}</Text>
              <Text style={s.waterValue}>{goal.water} {t('goal.unitMl')}</Text>
            </View>
          </View>

          {goal.warning === 'rate_not_safe' && (
            <View style={s.notice}>
              <Text style={s.noticeText}>{t('goal.warningRate')}</Text>
            </View>
          )}

          {saved && <Text style={s.saved}>{t('goal.saved')}</Text>}

          <Pressable style={s.secondaryButton} onPress={() => setGoal(null)}>
            <Text style={s.secondaryButtonText}>{t('onboarding.recalculate')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: t('app.name'), headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t('onboarding.title')}</Text>
        <Text style={s.subtitle}>{t('onboarding.subtitle')}</Text>

        <Label c={colors}>{t('onboarding.sex')}</Label>
        <View style={s.optionRow}>
          <Choice label={t('onboarding.female')} active={sex === 'female'} onPress={() => setSex('female')} c={colors} />
          <Choice label={t('onboarding.male')} active={sex === 'male'} onPress={() => setSex('male')} c={colors} />
        </View>

        <Field label={t('onboarding.birthDate')} value={birthDate} onChange={setBirthDate} placeholder={t('onboarding.birthDatePlaceholder')} c={colors} />
        <Field label={t('onboarding.height')} value={height} onChange={setHeight} keyboard="numeric" c={colors} />
        <Field label={t('onboarding.weight')} value={weight} onChange={setWeight} keyboard="numeric" c={colors} />
        <Field label={t('onboarding.targetWeight')} value={targetWeight} onChange={setTargetWeight} keyboard="numeric" c={colors} />

        <Label c={colors}>{t('onboarding.activity')}</Label>
        <View style={s.activityCol}>
          {ACTIVITIES.map((a) => (
            <Choice key={a} label={t(`activity.${a}`)} active={activity === a} onPress={() => setActivity(a)} c={colors} full />
          ))}
        </View>

        <Label c={colors}>{t('onboarding.rate')}</Label>
        <View style={s.optionRow}>
          {RATES.map((r) => (
            <Choice key={r} label={String(r)} active={rate === r} onPress={() => setRate(r)} c={colors} />
          ))}
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable style={s.primaryButton} onPress={compute}>
          <Text style={s.primaryButtonText}>{t('onboarding.submit')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ children, c }: { children: string; c: ThemeColors }) {
  return <Text style={{ color: c.textFaint, fontSize: fontSize.caption, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.xs }}>{children}</Text>;
}

function Field({ label, value, onChange, placeholder, keyboard, c }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'numeric' | 'default'; c: ThemeColors }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={{ color: c.textMuted, fontSize: fontSize.caption, marginBottom: spacing.xs }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        keyboardType={keyboard ?? 'default'}
        style={{ minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: fontSize.body }}
      />
    </View>
  );
}

function Choice({ label, active, onPress, c, full }: { label: string; active: boolean; onPress: () => void; c: ThemeColors; full?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{ minHeight: touchTarget, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : c.surface, flexGrow: full ? 1 : 0, alignSelf: full ? 'stretch' : 'auto' }}
    >
      <Text style={{ color: active ? c.onAccent : c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium }}>{label}</Text>
    </Pressable>
  );
}

function Macro({ label, value, c }: { label: string; value: string; c: ThemeColors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.textFaint, fontSize: fontSize.caption }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold }}>{value}</Text>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.xl, gap: spacing.xs, paddingBottom: spacing.xxl },
    title: { color: c.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
    subtitle: { color: c.textMuted, fontSize: fontSize.body, marginTop: spacing.xs },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    activityCol: { gap: spacing.sm },
    error: { color: c.notice, backgroundColor: c.noticeBackground, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg, fontSize: fontSize.body },
    primaryButton: { minHeight: touchTarget, backgroundColor: c.accent, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
    primaryButtonText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    secondaryButton: { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
    secondaryButtonText: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.medium },
    goalCard: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.lg, gap: spacing.lg },
    kcalValue: { color: c.accent, fontSize: 40, fontWeight: fontWeight.bold, textAlign: 'center' },
    kcalUnit: { color: c.textFaint, fontSize: fontSize.subtitle, fontWeight: fontWeight.regular },
    macroRow: { flexDirection: 'row', gap: spacing.sm },
    waterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md },
    waterLabel: { color: c.textMuted, fontSize: fontSize.body },
    waterValue: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    notice: { backgroundColor: c.noticeBackground, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
    noticeText: { color: c.notice, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    saved: { color: c.accent, fontSize: fontSize.body, fontWeight: fontWeight.medium, textAlign: 'center', marginTop: spacing.md },
  });
