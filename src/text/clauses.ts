import { splitClauses } from './segment';

/**
 * Clause structure of one sentence, for colouring.
 *
 * - `main` parts belong to a clause; `group` numbers the clauses in order, and
 *   the pieces of a clause that an aside interrupts share the same group, so
 *   "I think that, … it's good" reads as one colour.
 * - `aside` parts are interrupting phrases set off by a pair of commas, dashes
 *   or parentheses ("on a good day", "which had burned for forty years").
 *
 * Rule-based (no NLP model), Hermes-safe: no lookbehind or \p{} escapes.
 */
export interface ClausePart {
  text: string;
  role: 'main' | 'aside';
  /** Index of the main clause this part belongs to (asides: the clause they sit inside). */
  group: number;
  /** Whether whitespace followed this part in the original sentence. */
  space: boolean;
}

interface Span {
  start: number;
  end: number; // exclusive
}

const COORD = /^(and|but|or|nor|so|yet)\b/i;
const RELATIVE = /^(which|who|whom|whose)\b/i;
/** A subject pronoun opening a longer stretch means a full clause ("it was the worst of times"). */
const SUBJECT = /^(i|you|he|she|it|we|they|there)\b/i;
/** Phrases that open adverbial asides ("if you like", "on a good day", "of course"). */
const ADVERBIAL = /^(if|when|whenever|while|as|though|although|because|since|unless|until|after|before|once|on|in|at|of|for|with|by|from|during|despite|without|under|over|like|perhaps|maybe|probably|however|indeed|naturally|frankly|honestly|[a-z]+ly)\b/i;
/** Short sentence openers that end at the first comma ("In 1931,", "However,", "Yes,"). */
const INTRO = /^(in|on|at|by|for|after|before|during|since|until|when|while|if|as|once|however|yes|no|well|so|then|still|meanwhile|finally|first|second|later|now|today|yesterday|[a-z]+ly)\b/i;
const words = (s: string) => (s.match(/[A-Za-z0-9À-ɏͰ-ӿ'’]+/g) ?? []).length;

/** Marks characters inside double quotes so delimiters there are ignored. */
function quoteMask(s: string): boolean[] {
  const mask: boolean[] = new Array(s.length).fill(false);
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '“') inQ = true;
    else if (c === '”') inQ = false;
    else if (c === '"') inQ = !inQ;
    else mask[i] = inQ;
  }
  return mask;
}

const overlaps = (spans: Span[], a: number, b: number) => spans.some((sp) => a < sp.end && b > sp.start);

/** Interrupting phrases: (…), — … —, and , … , (with list / clause-boundary guards). */
export function findAsides(s: string): Span[] {
  const inQuote = quoteMask(s);
  const spans: Span[] = [];

  // Parentheses / brackets with at least two words inside.
  for (let i = 0; i < s.length; i++) {
    if ((s[i] !== '(' && s[i] !== '[') || inQuote[i] || i === 0) continue;
    const close = s.indexOf(s[i] === '(' ? ')' : ']', i);
    if (close < 0 || words(s.slice(i + 1, close)) < 2) continue;
    let end = close + 1;
    if (s[end] === ',' || s[end] === ';') end++;
    spans.push({ start: i, end });
    i = close;
  }

  // Dash pairs: "x — aside — y", "x – aside – y", "x--aside--y".
  const dashes: { at: number; len: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    if (inQuote[i]) continue;
    if (s[i] === '—' || (s[i] === '–' && s[i - 1] === ' ')) dashes.push({ at: i, len: 1 });
    else if (s[i] === '-' && s[i + 1] === '-') {
      dashes.push({ at: i, len: 2 });
      i++;
    }
  }
  for (let k = 0; k + 1 < dashes.length; k += 2) {
    const open = dashes[k];
    const close = dashes[k + 1];
    const start = open.at + open.len;
    const inner = s.slice(start, close.at);
    if (words(inner) < 1 || words(inner) > 14 || overlaps(spans, open.at, close.at)) continue;
    let from = start;
    while (s[from] === ' ') from++;
    spans.push({ start: from, end: close.at + close.len });
  }

  // Comma pairs.
  const commas: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ',' && s[i + 1] === ' ' && !inQuote[i] && !overlaps(spans, i, i + 1)) commas.push(i);
  }
  // Commas that separate list items ("eggs, milk, bread, and butter") never pair.
  const listCommas = new Set<number>();
  const segs = [0, ...commas.map((c) => c + 2)].map((st, i) => s.slice(st, i < commas.length ? commas[i] : s.length).trim());
  for (let i = 0; i < segs.length - 1; i++) {
    if (!/^(and|or)\b/i.test(segs[i + 1])) continue;
    // List items are nouns/phrases; "if you like", "when it rains" are asides, not items.
    if (/^(if|when|whenever|while|although|though|because|since|unless|until|as)\b/i.test(segs[i])) continue;
    for (let j = i; j >= 0 && words(segs[j]) <= 3; j--) {
      listCommas.add(commas[j]);
      if (j < i) listCommas.add(commas[j + 1]);
    }
    // "…, pears, and plums" — the comma before "and" is part of the list too.
    if (words(segs[i]) <= 3) listCommas.add(commas[i]);
  }

  for (let k = 0; k + 1 < commas.length; k++) {
    const c1 = commas[k];
    const c2 = commas[k + 1];
    if (listCommas.has(c1) || listCommas.has(c2)) continue;
    const inner = s.slice(c1 + 2, c2).trim();
    const after = s.slice(c2 + 2).trim();
    const n = words(inner);
    const limit = RELATIVE.test(inner) ? 12 : 8;
    if (n < 1 || n > limit) continue;
    if (COORD.test(inner)) continue; // ", and then," is a clause boundary, not an aside
    if (SUBJECT.test(inner) && n > 3) continue; // a full clause, not an interruption
    if (words(after) < 2) continue;
    // "…, I know, and so do you." — before "and", only clearly adverbial phrases count.
    if (COORD.test(after) && !ADVERBIAL.test(inner)) continue;
    const before = s.slice(0, c1);
    if (words(before) < 1) continue;
    // "In 1931, the lamp, which…": a short opener at the start doesn't open a pair.
    if (k === 0 && words(before) <= 4 && INTRO.test(before.trim())) continue;
    spans.push({ start: c1 + 2, end: c2 + 1 });
    k++; // c2 is used
  }

  return spans.sort((a, b) => a.start - b.start);
}

export function analyzeClauses(sentence: string): ClausePart[] {
  const s = sentence.trim();
  if (!s) return [];
  const asides = words(s) >= 6 ? findAsides(s) : [];

  // Main text = sentence minus asides; keep a map from skeleton index → original index.
  const mainSpans: Span[] = [];
  let cursor = 0;
  for (const a of asides) {
    if (a.start > cursor) mainSpans.push({ start: cursor, end: a.start });
    cursor = a.end;
  }
  if (cursor < s.length) mainSpans.push({ start: cursor, end: s.length });

  let skeleton = '';
  const map: number[] = [];
  for (const m of mainSpans) {
    const piece = s.slice(m.start, m.end);
    const lead = piece.length - piece.trimStart().length;
    const body = piece.trim();
    if (!body) continue;
    if (skeleton) {
      skeleton += ' ';
      map.push(-1);
    }
    for (let i = 0; i < body.length; i++) map.push(m.start + lead + i);
    skeleton += body;
  }

  // Clause boundaries in the skeleton, mapped back to original positions.
  const clauses = splitClauses(skeleton);
  const boundaries: number[] = []; // original index where clause g (g ≥ 1) starts
  let from = 0;
  for (let g = 0; g < clauses.length; g++) {
    const at = skeleton.indexOf(clauses[g], from);
    if (at < 0) break;
    if (g > 0) boundaries.push(map[at]);
    from = at + clauses[g].length;
  }
  const groupAt = (pos: number) => boundaries.filter((b) => b <= pos).length;

  // Cut the original sentence at aside edges and clause boundaries.
  const cuts = new Set<number>([0, s.length, ...boundaries]);
  for (const a of asides) {
    cuts.add(a.start);
    cuts.add(a.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const parts: ClausePart[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const raw = s.slice(points[i], points[i + 1]);
    const text = raw.trim();
    if (!text) continue;
    const start = points[i] + (raw.length - raw.trimStart().length);
    const isAside = asides.some((a) => start >= a.start && start < a.end);
    const end = start + text.length;
    parts.push({ text, role: isAside ? 'aside' : 'main', group: groupAt(start), space: /\s/.test(s[end] ?? '') });
  }
  // Asides take the group of the clause they interrupt (the main text just before them).
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].role === 'aside') parts[i].group = i > 0 ? parts[i - 1].group : 0;
  }
  if (parts.length) parts[parts.length - 1].space = false;
  return parts;
}
