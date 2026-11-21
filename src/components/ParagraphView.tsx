import { memo, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { Settings } from '../store/settings';
import type { Block } from '../text/blocks';
import { fixationSplit, type Sentence } from '../text/paragraph';
import { withAlpha } from '../theme/color';
import { fontFamily } from '../theme/fonts';
import type { Theme } from '../theme/themes';

interface Props {
  block: Block;
  sentences: Sentence[];
  /** How many sentences are revealed (0..sentences.length). */
  revealed: number;
  settings: Settings;
  theme: Theme;
}

type State = 'past' | 'current' | 'hidden';

const FADED_ALPHA = 0.16;

/**
 * Renders one paragraph with every sentence laid out from the start (so nothing
 * reflows as you tap), but only revealed sentences are readable. The current
 * sentence is emphasised and its clauses are separated to show structure.
 */
function ParagraphViewInner({ block, sentences, revealed, settings, theme }: Props) {
  const isHeading = block.kind === 'heading';
  const baseSize = isHeading ? Math.round(settings.fontSize * (block.level === 1 ? 1.45 : 1.25)) : settings.fontSize;
  const base: TextStyle = {
    color: theme.text,
    fontSize: baseSize,
    lineHeight: Math.round(baseSize * settings.lineHeight),
    letterSpacing: baseSize * (settings.extraSpacing ? 0.12 : 0.02),
    fontFamily: block.kind === 'code' ? Platform.select({ ios: 'Menlo', default: 'monospace' }) : fontFamily(settings.font, isHeading),
    fontWeight: isHeading && settings.font === 'system' ? '700' : undefined,
    textAlign: 'left',
  };
  const boldFamily = fontFamily(settings.font, true);

  const stateOf = (i: number): State => (i < revealed - 1 ? 'past' : i === revealed - 1 ? 'current' : 'hidden');

  const sentenceStyle = (state: State): TextStyle => {
    if (state === 'past') return { color: withAlpha(theme.text, settings.pastOpacity) };
    if (state === 'current') return settings.highlightCurrent ? { backgroundColor: theme.highlight } : {};
    switch (settings.unrevealed) {
      case 'bars':
        return { color: 'transparent', backgroundColor: theme.placeholder };
      case 'hidden':
        return { color: 'transparent' };
      case 'faded':
      default:
        return { color: withAlpha(theme.text, FADED_ALPHA) };
    }
  };

  /** Words with an optional bold fixation prefix (only for readable text). */
  const renderWords = (text: string, state: State, key: string): ReactNode => {
    if (!settings.fixationBold || state === 'hidden' || isHeading || block.kind === 'code') return text;
    return text.split(/(\s+)/).map((w, j) => {
      if (!w.trim()) return w;
      const [head, tail] = fixationSplit(w);
      return (
        <Text key={`${key}-${j}`}>
          <Text style={{ fontFamily: boldFamily, fontWeight: settings.font === 'system' || settings.font === 'serif' ? '700' : undefined }}>{head}</Text>
          {tail}
        </Text>
      );
    });
  };

  const clauseColor = (state: State, k: number) =>
    state === 'current' && settings.clauseMode !== 'off' && k % 2 === 1 ? { color: theme.clauseAlt } : null;

  const prefix = block.kind === 'list' ? '•  ' : '';
  const containerStyle = [
    block.kind === 'quote' && { borderLeftWidth: 3, borderLeftColor: theme.border, paddingLeft: 14 },
    block.kind === 'code' && { backgroundColor: theme.surface, padding: 12, borderRadius: 8 },
  ];

  if (settings.clauseMode === 'cascade' && !isHeading && block.kind !== 'code') {
    // Visual-syntactic cascade: each sentence is a group, each clause its own line,
    // continuation clauses indented. Layout is identical revealed or not.
    return (
      <View style={containerStyle}>
        {sentences.map((s, i) => {
          const state = stateOf(i);
          return (
            <View key={i} style={styles.cascadeSentence}>
              {s.clauses.map((c, k) => (
                <Text key={k} style={[base, { paddingLeft: k === 0 ? 0 : baseSize * 1.2 }]}>
                  {i === 0 && k === 0 ? prefix : ''}
                  <Text style={[sentenceStyle(state), clauseColor(state, k)]}>{renderWords(c, state, `${i}-${k}`)}</Text>
                </Text>
              ))}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={base} accessibilityRole={isHeading ? 'header' : 'text'}>
        {prefix}
        {sentences.map((s, i) => {
          const state = stateOf(i);
          const style = sentenceStyle(state);
          const parts =
            state === 'current' && settings.clauseMode === 'tint' && s.clauses.length > 1
              ? s.clauses.map((c, k) => (
                  <Text key={k} style={clauseColor(state, k)}>
                    {renderWords(c, state, `${i}-${k}`)}
                    {k < s.clauses.length - 1 ? ' ' : ''}
                  </Text>
                ))
              : renderWords(s.text, state, `${i}`);
          return (
            <Text key={i}>
              <Text style={style}>{parts}</Text>
              {i < sentences.length - 1 ? ' ' : ''}
            </Text>
          );
        })}
      </Text>
    </View>
  );
}

export const ParagraphView = memo(ParagraphViewInner);

const styles = StyleSheet.create({
  cascadeSentence: { marginBottom: 10 },
});
