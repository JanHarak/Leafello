import Feather from '@expo/vector-icons/Feather';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dailyTotals } from '@dietapp/diary';
import { detectEscalation } from '@dietapp/nutrition-analyst';
import {
  applyLoggedDay,
  awardsForDay,
  isActionable,
  levelForXp,
  levelProgress,
  moodFor,
  totalXp,
  MIN_MEALS_FOR_LOGGED_DAY,
  type Mood,
  type StreakState,
} from '@dietapp/gamification-rules';

import { Avatar } from '@/components/Avatar';
import { ProgressRing } from '@/components/ProgressRing';
import { Tooltip } from '@/components/Tooltip';
import { plural, t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { NAV_ITEMS } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import {
  getActiveGoal,
  getAvatarState,
  getLatestWeightKg,
  getProfileHeightCm,
  getRecentDailyKcal,
  getTodayWaterMl,
  hasWeighedToday,
  listTodayEntries,
  saveAvatarState,
  type GoalRow,
} from '@/lib/db';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

interface Consumed {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [consumed, setConsumed] = useState<Consumed | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [entriesToday, setEntriesToday] = useState(0);
  const [level, setLevel] = useState(0);
  const [levelPct, setLevelPct] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [celebrated, setCelebrated] = useState(false);
  const [escalated, setEscalated] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setGoal(null);
        setConsumed(null);
        return;
      }
      let active = true;
      (async () => {
        try {
          const g = await getActiveGoal();
          const entries = await listTodayEntries();
          const totals = dailyTotals(entries.map((e) => e.snapshot));
          const water = await getTodayWaterMl();

          const st = (await getAvatarState()) ?? {
            level: 0,
            xp: 0,
            streak_days: 0,
            streak_saves_left: 1,
            streak_month: null,
            last_active_on: null,
          };
          let leveledUp = false;
          const today = new Date().toISOString().slice(0, 10);
          if (entries.length >= MIN_MEALS_FOR_LOGGED_DAY) {
            const streak: StreakState = {
              streakDays: st.streak_days,
              lastLoggedOn: st.last_active_on,
              savesLeft: st.streak_saves_left,
              savesMonth: st.streak_month ? st.streak_month.slice(0, 7) : null,
              savesUsedTotal: 0,
            };
            const res = applyLoggedDay(streak, today);
            if (res.outcome !== 'unchanged') {
              const weighed = await hasWeighedToday();
              const awards = awardsForDay({
                mealsLogged: entries.length,
                waterGoalMet: g ? water >= g.water_ml : false,
                weighedIn: weighed,
                recipesCreated: 0,
                streakDays: res.state.streakDays,
              });
              const newXp = st.xp + totalXp(awards);
              const newLevel = levelForXp(newXp);
              leveledUp = newLevel > st.level;
              await saveAvatarState(session.user.id, {
                level: newLevel,
                xp: newXp,
                streak_days: res.state.streakDays,
                streak_saves_left: res.state.savesLeft,
                streak_month: res.state.savesMonth ? `${res.state.savesMonth}-01` : null,
                last_active_on: today,
              });
              st.xp = newXp;
              st.level = newLevel;
              st.streak_days = res.state.streakDays;
            }
          }

          let escalate = false;
          try {
            const heightCm = await getProfileHeightCm();
            const weightKg = await getLatestWeightKg();
            const bmi = heightCm && weightKg ? weightKg / Math.pow(heightCm / 100, 2) : null;
            const recent = await getRecentDailyKcal(5);
            const kcalByDate = new Map(recent.map((r) => [r.date, r.kcal]));
            const ratios: (number | null)[] = [];
            for (let i = 4; i >= 0; i -= 1) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const key = d.toISOString().slice(0, 10);
              const kcal = kcalByDate.get(key);
              ratios.push(kcal != null && g && g.kcal_target > 0 ? kcal / g.kcal_target : null);
            }
            escalate = detectEscalation({ bmi, recentDailyKcalRatios: ratios }).escalated;
          } catch {
            escalate = false;
          }

          if (active) {
            setGoal(g);
            setConsumed({ kcal: totals.kcal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat });
            setWaterMl(water);
            setEntriesToday(entries.length);
            const prog = levelProgress(st.xp);
            setLevel(prog.level);
            setLevelPct(prog.progress);
            setStreakDays(st.streak_days);
            setCelebrated(leveledUp);
            setEscalated(escalate);
          }
        } catch {
          // dashboard je doplněk, chyby řeší příslušné obrazovky
        }
      })();
      return () => {
        active = false;
      };
    }, [session]),
  );

  const mood: Mood | null =
    session && goal && consumed
      ? moodFor({
          entriesToday,
          waterRatio: goal.water_ml > 0 ? waterMl / goal.water_ml : 1,
          kcalRatio: goal.kcal_target > 0 ? consumed.kcal / goal.kcal_target : 1,
          justCelebrated: celebrated,
          hour: new Date().getHours(),
        })
      : null;

  const s = styles(colors);

  return (
    <ScrollView contentContainerStyle={s.content}>
      {escalated ? (
        <EscalationCard colors={colors} />
      ) : session && goal && consumed && mood ? (
        <>
          {/* Řádek: jídlo – postavička – pití */}
          <View style={s.topRow}>
            <Ring
              colors={colors}
              color={colors.ringWater}
              size={184}
              progress={goal.kcal_target > 0 ? consumed.kcal / goal.kcal_target : 0}
              value={`${consumed.kcal}`}
              unit={`/ ${goal.kcal_target} ${t('goal.unitKcal')}`}
              caption={t('home.today')}
              icon="zap"
            />
            <View style={s.avatarCol}>
              <Avatar mood={mood} size={184} />
              <Text style={s.caption}>{t(`avatar.mood.${mood}`)}</Text>
            </View>
            <Ring
              colors={colors}
              color={colors.accent}
              size={184}
              progress={goal.water_ml > 0 ? waterMl / goal.water_ml : 0}
              value={`${waterMl}`}
              unit={`/ ${goal.water_ml} ${t('goal.unitMl')}`}
              caption={t('goal.water')}
              icon="droplet"
            />
          </View>

          {/* Level, série a akce */}
          <View style={s.statusRow}>
            <Text style={s.level}>
              {t('level.label', { n: level })}
              {streakDays > 0 ? `  ·  ${plural('streak.days', streakDays)}` : ''}
            </Text>
            <View style={s.levelBar}>
              <View style={[s.levelBarFill, { width: `${levelPct * 100}%` as `${number}%` }]} />
            </View>
            {isActionable(mood) && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(mood === 'thirsty' ? '/water' : '/diary')}
                style={s.heroAction}
              >
                <Text style={s.heroActionText}>{mood === 'thirsty' ? t('avatar.actionWater') : t('avatar.actionLog')}</Text>
              </Pressable>
            )}
          </View>

          {/* Makra jako kruhové grafy */}
          <View style={s.macroRings}>
            <Ring colors={colors} color={colors.macroProtein} size={132} strokeWidth={13}
              progress={goal.protein_g > 0 ? consumed.protein / goal.protein_g : 0}
              value={`${consumed.protein}`} unit={`/ ${goal.protein_g} ${t('goal.unitG')}`} caption={t('goal.protein')} />
            <Ring colors={colors} color={colors.macroCarbs} size={132} strokeWidth={13}
              progress={goal.carbs_g > 0 ? consumed.carbs / goal.carbs_g : 0}
              value={`${consumed.carbs}`} unit={`/ ${goal.carbs_g} ${t('goal.unitG')}`} caption={t('goal.carbs')} />
            <Ring colors={colors} color={colors.macroFat} size={132} strokeWidth={13}
              progress={goal.fat_g > 0 ? consumed.fat / goal.fat_g : 0}
              value={`${consumed.fat}`} unit={`/ ${goal.fat_g} ${t('goal.unitG')}`} caption={t('goal.fat')} />
          </View>
        </>
      ) : session && !goal ? (
        <View style={s.card}>
          <Text style={s.body}>{t('home.setGoalFirst')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding')} style={s.primary}>
            <Text style={s.primaryText}>{t('home.start')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.body}>{t('home.subtitle')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={s.primary}>
            <Text style={s.primaryText}>{t('auth.signIn')}</Text>
          </Pressable>
        </View>
      )}

      {/* Ikonové akční dlaždice s popiskem při najetí */}
      <View style={s.tiles}>
        {NAV_ITEMS.map((item) => (
          <Tooltip key={String(item.route)} label={t(item.labelKey)} onPress={() => router.push(item.route)} style={s.tile}>
            <Feather name={item.icon} size={26} color={colors.accent} />
          </Tooltip>
        ))}
      </View>
    </ScrollView>
  );
}

function Ring({
  colors,
  color,
  progress,
  value,
  unit,
  caption,
  icon,
  size = 156,
  strokeWidth = 16,
}: {
  colors: ThemeColors;
  color: string;
  progress: number;
  value: string;
  unit: string;
  caption: string;
  icon?: ComponentProps<typeof Feather>['name'];
  size?: number;
  strokeWidth?: number;
}) {
  const valueFont = Math.max(18, Math.round(size * 0.2));
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <ProgressRing progress={progress} color={color} trackColor={colors.surfaceElevated} size={size} strokeWidth={strokeWidth}>
        {icon && <Feather name={icon} size={Math.round(size * 0.12)} color={color} style={{ marginBottom: 2 }} />}
        <Text style={{ color: colors.text, fontSize: valueFont, fontWeight: fontWeight.bold }}>{value}</Text>
        <Text style={{ color: colors.textFaint, fontSize: fontSize.caption }}>{unit}</Text>
      </ProgressRing>
      <Text style={{ color, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 1, fontWeight: fontWeight.bold }}>
        {caption}
      </Text>
    </View>
  );
}

function EscalationCard({ colors }: { colors: ThemeColors }) {
  const s = styles(colors);
  return (
    <View style={s.escalation}>
      <Text style={s.escalationTitle}>{t('escalation.title')}</Text>
      <Text style={s.escalationBody}>{t('escalation.body')}</Text>
      <Text style={s.escalationHelp}>{t('escalation.helpName')}</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => Linking.openURL('https://www.anabell.cz')}>
        <Text style={s.primaryText}>{t('escalation.helpAction')}</Text>
      </Pressable>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.lg, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
    caption: { color: c.textMuted, fontSize: fontSize.body, textAlign: 'center' },
    level: { color: c.text, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    levelBar: { height: 6, borderRadius: radius.pill, overflow: 'hidden', width: 220, backgroundColor: c.surfaceElevated },
    levelBarFill: { height: 6, borderRadius: radius.pill, backgroundColor: c.accent },
    heroAction: { minHeight: touchTarget, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    heroActionText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, justifyContent: 'center', alignItems: 'center' },
    avatarCol: { alignItems: 'center', gap: spacing.xs },
    statusRow: { alignItems: 'center', gap: spacing.sm },
    macroRings: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, justifyContent: 'center' },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center', marginTop: spacing.sm },
    tile: { width: 64, height: 64, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, alignSelf: 'center', width: '100%', maxWidth: 480 },
    body: { color: c.textMuted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5, textAlign: 'center' },
    primary: { minHeight: touchTarget, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    primaryText: { color: c.onAccent, fontSize: fontSize.body, fontWeight: fontWeight.bold },
    escalation: { backgroundColor: c.noticeBackground, borderColor: c.notice, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 520 },
    escalationTitle: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold },
    escalationBody: { color: c.text, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5 },
    escalationHelp: { color: c.textMuted, fontSize: fontSize.body, fontWeight: fontWeight.medium },
  });
