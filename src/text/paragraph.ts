import type { Block } from './blocks';
import { analyzeClauses, type ClausePart } from './clauses';
import { splitClauses, splitSentences } from './segment';

export interface Sentence {
  text: string;
  clauses: string[];
  /** Clause structure with interrupting asides, for colouring and cascade layout. */
  parts: ClausePart[];
}

/** Split a block into sentences (and each sentence into clauses) for revealing. */
export function segmentBlock(block: Block): Sentence[] {
  const whole = (text: string): Sentence => ({ text, clauses: [text], parts: [{ text, role: 'main', group: 0, space: false }] });
  if (block.kind === 'heading' || block.kind === 'code') return [whole(block.text)];
  const sentences = splitSentences(block.text);
  if (!sentences.length) return [whole(block.text)];
  return sentences.map((s) => ({ text: s, clauses: splitClauses(s), parts: analyzeClauses(s) }));
}

/**
 * Split a word into a bold "fixation" prefix and the remainder.
 * Short words get 1 letter, longer words roughly 40%.
 */
export function fixationSplit(word: string): [string, string] {
  const letters = [...word].filter(isWordChar).length;
  if (letters === 0) return ['', word];
  const n = letters <= 3 ? 1 : Math.ceil(letters * 0.4);
  let count = 0;
  let i = 0;
  for (; i < word.length && count < n; i++) if (isWordChar(word[i])) count++;
  return [word.slice(0, i), word.slice(i)];
}

const isWordChar = (c: string) => c.toLowerCase() !== c.toUpperCase() || (c >= '0' && c <= '9');

/**
 * How sentence `i` is drawn when `revealed` sentences are shown.
 * past: already read · current: the active sentence · hidden: not reached yet
 * (drawn faint/bars/blank per settings) · concealed: focus mode — invisible.
 */
export type SentenceState = 'past' | 'current' | 'hidden' | 'concealed';

export function sentenceState(i: number, revealed: number, focusOnly: boolean): SentenceState {
  if (i === revealed - 1) return 'current';
  if (focusOnly) return 'concealed';
  return i < revealed - 1 ? 'past' : 'hidden';
}
