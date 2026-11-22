import { memo, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { Settings } from '../store/settings';
import type { Block } from '../text/blocks';
import type { ClausePart } from '../text/clauses';
import { fixationSplit, sentenceState, type Sentence, type SentenceState } from '../text/paragraph';
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

const FADED_ALPHA = 0.16;

/**
 * Renders one paragraph with every sentence laid out from the start (so nothing
 * reflows as you tap), but only revealed sentences are readable. The current
 * sentence is emphasised and its clauses coloured: each clause keeps one colour
 * even when an aside interrupts it, and asides get their own colour.
 * Focus mode (eye button) conceals every sentence except the current one.
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
  const clausesOn = settings.clauseMode !== 'off' && !isHeading && block.kind !== 'code';

  const sentenceStyle = (state: SentenceState): TextStyle => {
    switch (state) {
      case 'past':
        return { color: withAlpha(theme.text, settings.pastOpacity) };
      case 'current':
        return settings.highlightCurrent ? { backgroundColor: theme.highlight } : {};
      case 'concealed':
        return { color: 'transparent' };
      case 'hidden':
      default:
        if (settings.unrevealed === 'bars') return { color: 'transparent', backgroundColor: theme.placeholder };
        if (settings.unrevealed === 'hidden') return { color: 'transparent' };
        return { color: withAlpha(theme.text, FADED_ALPHA) };
    }
  };

  /** Clause colour: the clause's alternating colour, or the aside colour. Current sentence only. */
  const partColor = (state: SentenceState, part: ClausePart): TextStyle | null => {
    if (state !== 'current' || !clausesOn) return null;
    if (part.role === 'aside') return { color: theme.clauseAside };
    return part.group % 2 === 1 ? { color: theme.clauseAlt } : null;
  };

  /** Words with an optional bold fixation prefix (only for readable text). */
  const renderWords = (text: string, state: SentenceState, key: string): ReactNode => {
    if (!settings.fixationBold || state === 'hidden' || state === 'concealed' || isHeading || block.kind === 'code') return text;
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

  const prefix = block.kind === 'list' ? '•  ' : '';
  const containerStyle = [
    block.kind === 'quote' && { borderLeftWidth: 3, borderLeftColor: theme.border, paddingLeft: 14 },
    block.kind === 'code' && { backgroundColor: theme.surface, padding: 12, borderRadius: 8 },
  ];

  if (settings.clauseMode === 'cascade' && clausesOn) {
    // Visual-syntactic cascade: each clause part on its own line. Continuations
    // are indented one step, asides two, so the main line of thought stays left.
    return (
      <View style={containerStyle}>
        {sentences.map((s, i) => {
          const state = sentenceState(i, revealed, settings.focusSentence);
          return (
            <View key={i} style={styles.cascadeSentence}>
              {s.parts.map((part, k) => {
                const indent = part.role === 'aside' ? 2 : k === 0 ? 0 : 1;
                return (
                  <Text key={k} style={[base, { paddingLeft: indent * baseSize * 1.2 }]}>
                    {i === 0 && k === 0 ? prefix : ''}
                    <Text style={[sentenceStyle(state), partColor(state, part)]}>{renderWords(part.text, state, `${i}-${k}`)}</Text>
                  </Text>
                );
              })}
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
          const state = sentenceState(i, revealed, settings.focusSentence);
          const colourParts = state === 'current' && clausesOn && s.parts.length > 1;
          const content = colourParts
            ? s.parts.map((part, k) => (
                <Text key={k} style={partColor(state, part)}>
                  {renderWords(part.text, state, `${i}-${k}`)}
                  {part.space ? ' ' : ''}
                </Text>
              ))
            : renderWords(s.text, state, `${i}`);
          return (
            <Text key={i}>
              <Text style={sentenceStyle(state)}>{content}</Text>
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
