import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useReducer, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import {
  LANGUAGES,
  getLanguage,
  plural,
  setLanguage,
  t,
} from '@/i18n';
import { useAuth } from '@/lib/auth';
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
import {
  colorsFor,
  fontSize,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  type ThemeColors,
} from '@/theme';

interface Consumed {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = colorsFor(scheme);
  const router = useRouter();
  const { session, signOut } = useAuth();
  // i18n drží aktivní jazyk v modulu; tímhle překreslíme po přepnutí.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const activeLang = getLanguage();

  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [consumed, setConsumed] = useState<Consumed | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [entriesToday, setEntriesToday] = useState(0);
  const [level, setLevel] = useState(0);
  const [levelPct, setLevelPct] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [celebrated, setCelebrated] = useState(false);
  const [escalated, setEscalated] = useState(false);

  // Načti cíl a dnešní příjem vždy, když je obrazovka aktivní (i po návratu
  // z deníku, ať se čísla aktualizují).
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

          // Herní stav: XP, level a série. Přidělení je idempotentní přes den
          // (applyLoggedDay se stejným dnem vrátí 'unchanged').
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

          // Bezpečnostní eskalace (nutrition-analyst 8.1).
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
          // ticho: dashboard je doplněk, chyby zápisu řeší příslušné obrazovky
        }
      })();
      return () => {
        active = false;
      };
    }, [session]),
  );

  function switchLanguage(code: string) {
    setLanguage(code);
    rerender();
  }

  // Nálada avatara z pravidel gamification-rules. Herní mechanika se má skrýt
  // při aktivní eskalaci z nutrition-analyst (zatím placeholder, proto vždy).
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

  function onAvatarAction(m: Mood) {
    if (m === 'thirsty') router.push('/water');
    else router.push('/diary');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          {t('app.name')}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('home.subtitle')}
        </Text>

        {!escalated && mood && (
          <View style={styles.avatarBlock}>
            <Avatar mood={mood} />
            <Text style={[styles.avatarCaption, { color: colors.textMuted }]}>{t(`avatar.mood.${mood}`)}</Text>
            <Text style={[styles.levelText, { color: colors.text }]}>
              {t('level.label', { n: level })}
              {streakDays > 0 ? `  ·  ${plural('streak.days', streakDays)}` : ''}
            </Text>
            <View style={[styles.levelBar, { backgroundColor: colors.surfaceElevated }]}>
              <View style={[styles.levelBarFill, { backgroundColor: colors.accent, width: `${levelPct * 100}%` as `${number}%` }]} />
            </View>
            {isActionable(mood) && (
              <Pressable
                accessibilityRole="button"
                onPress={() => onAvatarAction(mood)}
                style={[styles.avatarAction, { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.startText, { color: colors.onAccent }]}>
                  {mood === 'thirsty' ? t('avatar.actionWater') : t('avatar.actionLog')}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {escalated ? (
          <EscalationCard colors={colors} />
        ) : session && goal && consumed ? (
          <TodayCard goal={goal} consumed={consumed} waterMl={waterMl} colors={colors} />
        ) : session && !goal ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.body, { color: colors.textMuted }]}>{t('home.setGoalFirst')}</Text>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.body, { color: colors.text }]}>
              {t('home.stackNote')}
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t('home.phaseNote')}
            </Text>
            {/* Ukázka CLDR plurálu z i18n. */}
            <Text style={[styles.streak, { color: colors.accent }]}>
              {plural('streak.days', 3)}
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/onboarding')}
          style={[styles.startButton, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.startText, { color: colors.onAccent }]}>{t('home.start')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/diary')}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.startText, { color: colors.text }]}>{t('diary.open')}</Text>
        </Pressable>

        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/water')}
            style={[styles.navButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.startText, { color: colors.text }]}>{t('water.open')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/weight')}
            style={[styles.navButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.startText, { color: colors.text }]}>{t('weight.open')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/reminders')}
            style={[styles.navButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.startText, { color: colors.text }]}>{t('reminders.open')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/recipes')}
            style={[styles.navButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.startText, { color: colors.text }]}>{t('recipes.open')}</Text>
          </Pressable>
        </View>

        {session ? (
          <View style={styles.authRow}>
            <Text style={[styles.authInfo, { color: colors.textFaint }]}>
              {t('auth.signedInAs', { email: session.user.email ?? '' })}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => signOut()}>
              <Text style={[styles.authAction, { color: colors.accent }]}>{t('auth.signOut')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/login')}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.startText, { color: colors.text }]}>{t('auth.signIn')}</Text>
          </Pressable>
        )}

        <Text style={[styles.label, { color: colors.textFaint }]}>
          {t('language.label')}
        </Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === activeLang;
            return (
              <Pressable
                key={lang.code}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => switchLanguage(lang.code)}
                style={[
                  styles.langButton,
                  {
                    backgroundColor: isActive ? colors.accent : colors.surface,
                    borderColor: isActive ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langText,
                    { color: isActive ? colors.onAccent : colors.text },
                  ]}
                >
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.spacer} />

        {/* N-07 / F-03: viditelná atribuce ODbL. */}
        <Text style={[styles.attribution, { color: colors.textFaint }]}>
          {t('attribution.off')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function EscalationCard({ colors }: { colors: ThemeColors }) {
  return (
    <View style={[styles.escalation, { backgroundColor: colors.noticeBackground, borderColor: colors.notice }]}>
      <Text style={[styles.escalationTitle, { color: colors.text }]}>{t('escalation.title')}</Text>
      <Text style={[styles.escalationBody, { color: colors.text }]}>{t('escalation.body')}</Text>
      <Text style={[styles.escalationHelp, { color: colors.textMuted }]}>{t('escalation.helpName')}</Text>
      <Pressable
        accessibilityRole="button"
        style={[styles.escalationAction, { backgroundColor: colors.accent }]}
        onPress={() => Linking.openURL('https://www.anabell.cz')}
      >
        <Text style={[styles.startText, { color: colors.onAccent }]}>{t('escalation.helpAction')}</Text>
      </Pressable>
    </View>
  );
}

function TodayCard({ goal, consumed, waterMl, colors }: { goal: GoalRow; consumed: Consumed; waterMl: number; colors: ThemeColors }) {
  const pct = goal.kcal_target > 0 ? Math.min(1, consumed.kcal / goal.kcal_target) : 0;
  const remaining = Math.max(0, goal.kcal_target - consumed.kcal);
  return (
    <View style={[styles.today, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.todayLabel, { color: colors.textFaint }]}>{t('home.today')}</Text>
      <Text style={[styles.todayKcal, { color: colors.text }]}>
        {consumed.kcal}{' '}
        <Text style={[styles.todayTarget, { color: colors.textFaint }]}>
          / {goal.kcal_target} {t('goal.unitKcal')}
        </Text>
      </Text>
      <View style={[styles.bar, { backgroundColor: colors.surfaceElevated }]}>
        <View style={[styles.barFill, { backgroundColor: colors.accent, width: `${pct * 100}%` as `${number}%` }]} />
      </View>
      <Text style={[styles.remaining, { color: colors.textMuted }]}>
        {consumed.kcal >= goal.kcal_target ? t('home.goalReached') : t('home.remaining', { n: remaining })}
      </Text>
      <View style={styles.todayMacros}>
        <MacroCol label={t('goal.protein')} value={consumed.protein} target={goal.protein_g} colors={colors} />
        <MacroCol label={t('goal.carbs')} value={consumed.carbs} target={goal.carbs_g} colors={colors} />
        <MacroCol label={t('goal.fat')} value={consumed.fat} target={goal.fat_g} colors={colors} />
      </View>
      <Text style={[styles.waterLine, { color: colors.textMuted }]}>
        {t('goal.water')}: {waterMl} / {goal.water_ml} {t('goal.unitMl')}
      </Text>
    </View>
  );
}

function MacroCol({ label, value, target, colors }: { label: string; value: number; target: number; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: colors.textFaint, fontSize: fontSize.caption }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.bold }}>
        {value} / {target} {t('goal.unitG')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  today: {
    marginTop: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  todayLabel: {
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: fontWeight.medium,
  },
  todayKcal: {
    fontSize: 36,
    fontWeight: fontWeight.bold,
  },
  todayTarget: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.regular,
  },
  bar: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: radius.pill,
  },
  remaining: {
    fontSize: fontSize.body,
  },
  todayMacros: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  waterLine: {
    fontSize: fontSize.body,
    paddingTop: spacing.xs,
  },
  escalation: {
    marginTop: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  escalationTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
  },
  escalationBody: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.5,
  },
  escalationHelp: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  escalationAction: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  avatarCaption: {
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  levelText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  levelBar: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  levelBarFill: {
    height: 6,
    borderRadius: radius.pill,
  },
  avatarAction: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  navButton: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    flexGrow: 1,
  },
  eyebrow: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.regular,
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.5,
  },
  streak: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
  startButton: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  secondaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  startText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  authRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  authInfo: {
    fontSize: fontSize.caption,
    flexShrink: 1,
  },
  authAction: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  label: {
    marginTop: spacing.lg,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  langButton: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  langText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  spacer: {
    flex: 1,
    minHeight: spacing.xl,
  },
  attribution: {
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
});
