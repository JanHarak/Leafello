import { Text, View, type TextStyle } from 'react-native';

import { fontSize, fontWeight, radius, spacing, type ThemeColors } from '@/theme';

/**
 * Minimální renderer Markdownu pro statické právní texty. Podporuje nadpisy
 * (#, ##, ###), odrážky (-), citaci (>), tučné (**text**) a odstavce. Žádná
 * externí závislost, žádná přímo zapsaná barva (vše z theme).
 */
function Inline({ text, color, size, weight }: { text: string; color: string; size: number; weight?: TextStyle['fontWeight'] }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={{ color, fontSize: size, fontWeight: weight ?? fontWeight.regular, lineHeight: size * 1.5 }}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: fontWeight.bold }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function Markdown({ source, colors }: { source: string; colors: ThemeColors }) {
  const lines = source.split('\n');
  return (
    <View style={{ gap: spacing.sm }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (line === '') return <View key={i} style={{ height: spacing.xs }} />;
        if (line.startsWith('### ')) {
          return <Inline key={i} text={line.slice(4)} color={colors.text} size={fontSize.body} weight={fontWeight.bold} />;
        }
        if (line.startsWith('## ')) {
          return <Inline key={i} text={line.slice(3)} color={colors.text} size={fontSize.subtitle} weight={fontWeight.bold} />;
        }
        if (line.startsWith('# ')) {
          return <Inline key={i} text={line.slice(2)} color={colors.text} size={fontSize.title} weight={fontWeight.bold} />;
        }
        if (line.startsWith('> ')) {
          return (
            <View key={i} style={{ backgroundColor: colors.noticeBackground, borderRadius: radius.md, padding: spacing.md }}>
              <Inline text={line.slice(2)} color={colors.notice} size={fontSize.caption} />
            </View>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, paddingLeft: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.body }}>{'•'}</Text>
              <View style={{ flex: 1 }}>
                <Inline text={line.slice(2)} color={colors.textMuted} size={fontSize.body} />
              </View>
            </View>
          );
        }
        return <Inline key={i} text={line} color={colors.textMuted} size={fontSize.body} />;
      })}
    </View>
  );
}
