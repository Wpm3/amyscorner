import type { Block } from './blocks';
import { splitClauses, splitSentences } from './segment';

export interface Sentence {
  text: string;
  clauses: string[];
}

/** Split a block into sentences (and each sentence into clauses) for revealing. */
export function segmentBlock(block: Block): Sentence[] {
  if (block.kind === 'heading' || block.kind === 'code') return [{ text: block.text, clauses: [block.text] }];
  const sentences = splitSentences(block.text);
  if (!sentences.length) return [{ text: block.text, clauses: [block.text] }];
  return sentences.map((s) => ({ text: s, clauses: splitClauses(s) }));
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
