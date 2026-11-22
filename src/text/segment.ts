// segment.ts - no deps, no lookbehind, no \p{} (portable to any Hermes build)

// Never end a sentence (titles, Latin, references).
const ABBR_NEVER_END = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'rev', 'hon', 'gen', 'col', 'capt', 'lt', 'sgt', 'gov', 'sen', 'rep',
  'st', 'mt', 'ft', 'vs', 'v', 'cf', 'e.g', 'i.e', 'viz', 'al', 'approx', 'dept', 'est',
]);
// Abbreviation only when followed by a number ("No. 5", "Jan. 3", "p. 12").
const ABBR_BEFORE_NUM = new Set([
  'no', 'nos', 'fig', 'figs', 'p', 'pp', 'vol', 'ch', 'sec', 'art', 'eq',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);
// May legitimately end a sentence: split only if the next word looks like a sentence start.
const ABBR_MAY_END = new Set(['etc', 'inc', 'ltd', 'co', 'corp', 'jr', 'sr', 'a.m', 'p.m', 'u.s', 'u.k', 'ph.d']);

const OPENERS = '"\'“‘([{«';
const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
const isDigit = (c: string) => c >= '0' && c <= '9';
const PROTECTED = /\b(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g; // URLs, emails

export function splitSentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const shield: [number, number][] = [];
  for (const m of text.matchAll(PROTECTED)) {
    // A URL/email may still be followed by a real full stop: leave trailing punctuation unshielded.
    const core = m[0].replace(/[.!?,;:)"'”’]+$/, '');
    shield.push([m.index!, m.index! + core.length]);
  }
  const shielded = (i: number) => shield.some(([s, e]) => i >= s && i < e);

  const out: string[] = [];
  let start = 0;
  // terminal run, optional closers, whitespace
  const BOUNDARY = /([.!?…]+)(["'”’)\]»]*)\s+/g;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY.exec(text))) {
    const punctAt = m.index;
    const cut = m.index + m[1].length + m[2].length; // end of sentence
    const next = text.charAt(m.index + m[0].length);
    if (shielded(punctAt)) continue;
    // 1. Next sentence must start with uppercase, digit or an opener.
    if (!(isUpper(next) || isDigit(next) || OPENERS.includes(next))) continue;
    if (m[1] === '.' && !m[2]) {
      // 2. Inspect the token right before the period.
      const before = text.slice(start, punctAt);
      const tok = before.slice(before.lastIndexOf(' ') + 1).replace(/^["'“‘(\[]+/, '');
      const low = tok.toLowerCase();
      if (ABBR_NEVER_END.has(low)) continue;
      if (ABBR_BEFORE_NUM.has(low) && isDigit(next)) continue;
      if (/^[A-Z]$/.test(tok)) continue;                         // initial: J. R. R. Tolkien
      if (/^(\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})$/.test(tok) && before.trim() === tok) continue; // list item "1." / "a."
      if (ABBR_MAY_END.has(low) || /^([a-z]\.)+[a-z]$/i.test(tok)) {
        // "U.S. Army" (no split) vs "in the U.S. The" (split): require a common sentence opener.
        const nextWord = text.slice(m.index + m[0].length).split(' ')[0].replace(/[^\w']/g, '');
        if (!SENTENCE_OPENERS.has(nextWord.toLowerCase())) continue;
      }
    }
    out.push(text.slice(start, cut).trim());
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

const SENTENCE_OPENERS = new Set([
  'the', 'a', 'an', 'i', 'it', 'he', 'she', 'we', 'they', 'you', 'this', 'that', 'these', 'those', 'there',
  'but', 'and', 'so', 'then', 'in', 'on', 'at', 'after', 'when', 'if', 'what', 'why', 'how', 'my', 'our', 'his', 'her',
]);

// ---------------------------------------------------------------------------------------------

const COORD = new Set(['and', 'but', 'or', 'nor', 'so', 'yet', 'for']);
const SUBORD = new Set([
  'because', 'although', 'though', 'while', 'whereas', 'which', 'who', 'whom', 'whose',
  'when', 'where', 'if', 'unless', 'since', 'until', 'after', 'before',
]); // 'that' deliberately excluded: too ambiguous (", that is,", "so that")
const LEAD_SUBORD = new Set([...SUBORD, 'as', 'once', 'whenever', 'wherever']);
LEAD_SUBORD.delete('which'); LEAD_SUBORD.delete('who'); LEAD_SUBORD.delete('whom'); LEAD_SUBORD.delete('whose');
const NOT_CLAUSE_AFTER_FOR = new Set(['example', 'instance', 'now', 'once', 'good']);

export const MIN_WORDS = 3;
const words = (s: string) => (s.match(/[A-Za-z0-9À-ɏͰ-ӿ'’]+/g) || []).length;

export function splitClauses(sentence: string): string[] {
  const s = sentence.trim();
  if (words(s) < MIN_WORDS * 2) return [s];

  // Pass 1: find depth-0 positions and candidate cut points (cut = index where the new clause starts).
  const cuts = new Set<number>();
  let depth = 0;
  let inDQ = false;
  const commas: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') { if (depth === 0 && !inDQ) parenCut(i); depth++; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); if (depth === 0 && !inDQ && s[i + 1] === ' ') cuts.add(i + 2); continue; }
    if (c === '“') { inDQ = true; continue; }
    if (c === '”') { inDQ = false; continue; }
    if (c === '"') { inDQ = !inDQ; continue; }
    if (depth > 0 || inDQ) continue;
    const after = s[i + 1];
    if ((c === ';' || c === ':') && after === ' ') cuts.add(i + 2);
    else if (c === '—' || (c === '–' && s[i - 1] === ' ') || (c === '-' && s[i + 1] === '-')) {
      const end = c === '-' ? i + 2 : i + 1;
      cuts.add(s[end] === ' ' ? end + 1 : end);
      if (c === '-') i++;
    } else if (c === ',' && after === ' ') commas.push(i); // ", " only: 1,000 never matches
  }
  function parenCut(i: number) {
    const close = s.indexOf(')', i);
    if (close > 0 && words(s.slice(i, close)) >= MIN_WORDS + 1) cuts.add(i);
  }

  // Pass 2: comma rules.
  const firstWord = s.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  commas.forEach((ci, n) => {
    const rest = s.slice(ci + 2);
    const [w1, w2] = rest.split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z']/g, ''));
    if (n === 0 && LEAD_SUBORD.has(firstWord)) { cuts.add(ci + 2); return; } // "Although X, Y"
    if ((w1 === 'and' || w1 === 'or') && isListComma(s, commas, n)) return; // "pears, and plums"
    if (COORD.has(w1) && !(w1 === 'for' && NOT_CLAUSE_AFTER_FOR.has(w2))) cuts.add(ci + 2);
    else if (SUBORD.has(w1)) cuts.add(ci + 2);
  });

  // Pass 3: slice, then merge fragments that are too short.
  const points = [...cuts].filter((p) => p > 0 && p < s.length).sort((a, b) => a - b);
  let parts: string[] = [];
  let prev = 0;
  for (const p of points) { parts.push(s.slice(prev, p).trim()); prev = p; }
  parts.push(s.slice(prev).trim());
  parts = parts.filter(Boolean);
  for (let i = 0; i < parts.length && parts.length > 1; ) {
    if (words(parts[i]) >= MIN_WORDS) { i++; continue; }
    if (i === parts.length - 1) { parts[i - 1] += ' ' + parts[i]; parts.splice(i, 1); }
    else { parts[i] += ' ' + parts[i + 1]; parts.splice(i + 1, 1); }
  }
  return parts;
}

// Serial-list guard: ", and|or" closes a list when the item before it (since the previous comma)
// is short, e.g. "apples, pears, and plums". Commas before but/yet/so/subordinators are never list commas.
function isListComma(s: string, commas: number[], n: number): boolean {
  if (n === 0) return false;
  return words(s.slice(commas[n - 1] + 1, commas[n])) <= 3;
}
