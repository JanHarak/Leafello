import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { dayLabel, shiftISO, todayISO } from '@/lib/date';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme';
import { fontSize, fontWeight, radius, spacing, touchTarget, type ThemeColors } from '@/theme';

/**
 * Navigace mezi dny: šipka vlevo = předchozí den, uprostřed popisek
 * (Dnes/Včera/plné datum), šipka vpravo (jen v minulosti) = o den dopředu.
 * Sdílená deníkem i pitným režimem, ať je chování konzistentní.
 */
export function DayNav({ dateISO, onChange }: { dateISO: string; onChange: (iso: string) => void }) {
  const { colors } = useTheme();
  const { lang } = useLocale();
  const s = styles(colors);

  const isToday = dateISO === todayISO();
  const { label, sub } = dayLabel(dateISO, lang);

  return (
    <View style={s.dateNav}>
      <Pressable
        style={s.dateArrow}
        onPress={() => onChange(shiftISO(dateISO, -1))}
        accessibilityRole="button"
        accessibilityLabel={t('diary.prevDay')}
      >
        <Feather name="chevron-left" size={22} color={colors.text} />
      </Pressable>
      <View style={s.dateLabelWrap}>
        <Text style={s.dateLabel}>{label}</Text>
        {sub ? <Text style={s.dateSub}>{sub}</Text> : null}
      </View>
      {isToday ? (
        <View style={s.dateSpacer} />
      ) : (
        <Pressable
          style={s.dateArrow}
          onPress={() => onChange(shiftISO(dateISO, 1))}
          accessibilityRole="button"
          accessibilityLabel={t('diary.nextDay')}
        >
          <Feather name="chevron-right" size={22} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    dateArrow: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    dateSpacer: { width: touchTarget, height: touchTarget },
    dateLabelWrap: { flex: 1, alignItems: 'center' },
    dateLabel: { color: c.text, fontSize: fontSize.subtitle, fontWeight: fontWeight.bold, textTransform: 'capitalize' },
    dateSub: { color: c.textFaint, fontSize: fontSize.caption, textTransform: 'capitalize' },
  });
