import type { Block, ContentRange, ParsedDocument, RawTocEntry, TocEntry } from './blocks';

/**
 * Document structure analysis, shared by every format:
 *
 *  1. Re-join paragraphs that a page break (or file split) cut in two.
 *  2. Map the built-in table of contents (EPUB nav/NCX, PDF bookmarks, Word
 *     TOC…) onto blocks, or find a printed "Contents" list, or fall back to
 *     the document's headings.
 *  3. Work out where the actual reading content starts and ends, skipping
 *     front matter (title page, copyright, contents, dedication…) and back
 *     matter (acknowledgments, about the author, index…).
 */

export const STRUCTURE_VERSION = 1;

export interface AnalyzedDocument {
  blocks: Block[];
  toc: TocEntry[];
  content: ContentRange;
}

// ---------------------------------------------------------------------------
// Title classification

/** Normalise a heading/TOC title for matching: lower-case, no numbering, leaders or page numbers. */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/(\s*\.{2,}\s*|\s*…+\s*)\s*(\d{1,4}|[ivxlc]{1,7})\s*$/i, '') // "… 12" leaders + page
    .replace(/[^a-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FRONT_ONLY =
  /^(cover( page)?|front ?cover|title( page)?|half ?title( page)?|copyright( page| notice)?|(table of )?contents|toc|dedication|epigraph|frontispiece|imprint|list of (illustrations|figures|tables|maps|abbreviations)|about (this|the) (e ?book|edition|electronic edition)|legal( notice)?|disclaimer|front matter|landmarks|cast of characters|dramatis personae)$/;
const BACK_ONLY =
  /^(index|general index|subject index|about the (authors?|illustrators?|translators?|editors?|contributors?)|meet the authors?|notes?|end ?notes|chapter notes|bibliography|selected bibliography|references|works cited|sources|further reading|suggested reading|glossary|reading group (guide|questions)|discussion questions|questions for discussion|book club guide|a conversation with .*|an interview with .*|back matter|back ?cover|preview .*|excerpt .*|sneak peek.*|newsletter|connect with .*|follow .* online|about the publisher|more from .*|coming soon.*)$/;
/** Can appear at either end of a book: front if before the main text, back if after. */
const EITHER =
  /^(acknowledg(e)?ments?|also by .*|books by .*|other (books|titles|works) by .*|by the same author|praise for .*|advance praise.*|permissions?|credits|colophon|copyright( page)?)$/;
/** Headings that typically open the main text. */
const CONTENT_START =
  /^((chapter|part|book|section|act|canto|lesson|unit)\s+([\divxlcdm]+|[a-z]+)\b.*|prologue|preface|foreword|introduction|author s note|a note (from|on) .*|[\divxlc]{1,4}|one|1 .*|i .*)$/;

export type TitleClass = 'front' | 'back' | 'either' | 'start' | 'other';

export function classifyTitle(title: string): TitleClass {
  const t = normalizeTitle(title);
  if (!t) return 'other';
  if (FRONT_ONLY.test(t)) return 'front';
  if (BACK_ONLY.test(t)) return 'back';
  if (EITHER.test(t)) return 'either';
  if (CONTENT_START.test(t)) return 'start';
  return 'other';
}

// Copyright / legal boilerplate.
const LEGAL =
  /(copyright|©|\(c\)\s*(19|20)\d\d|all rights reserved|no part of this (book|publication|work)|isbn[\s:-]*[\dx-]{10,}|library of congress|cataloging[- ]in[- ]publication|printed in (the )?[a-z]|first (published|edition|printing)|published (by|in)|without (the )?(prior )?written permission|this (book|novel) is a work of fiction|any resemblance to actual persons|trademarks?\b|cover (design|art|illustration) by|typeset (in|by)|ebook edition|project gutenberg)/i;

export function legalScore(text: string): number {
  const m = text.match(new RegExp(LEGAL.source, 'gi'));
  return m ? m.length : 0;
}

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

// ---------------------------------------------------------------------------
// 1. Paragraphs split by page / file breaks

const ENDS_SENTENCE = /([.!?…]|[.!?…]["”’)\]»*]+|:)\s*$/;
const JOINER_END =
  /(,|;|—|–|-|\b(the|a|an|and|or|but|nor|of|to|in|on|at|by|for|with|from|into|that|which|who|whose|as|than|is|was|were|are|be|been|his|her|their|its|my|our|your|this|these|those|if|when|while|because|although|not|so)\s*)$/i;
const STARTS_LOWER = /^["“‘'(\[]?[a-zß-ÿ]/;

/**
 * Join a paragraph to the previous one when the previous paragraph was cut
 * mid-sentence: it doesn't end a sentence and the next one continues it
 * (starts lower-case, or the previous ends on a comma / "the" / "and"…, or
 * the two sit on consecutive PDF pages).
 */
export function mergeBrokenParagraphs(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && canContinue(prev, b)) {
      const hyphenated = /[A-Za-zÀ-ɏ]-$/.test(prev.text) && STARTS_LOWER.test(b.text);
      const merged: Block = { ...prev, text: hyphenated ? prev.text.slice(0, -1) + b.text : `${prev.text} ${b.text}` };
      if (b.anchors?.length) merged.anchors = [...(prev.anchors ?? []), ...b.anchors];
      out[out.length - 1] = merged;
    } else {
      out.push(b);
    }
  }
  return out;
}

function canContinue(a: Block, b: Block): boolean {
  if (a.kind !== b.kind || (a.kind !== 'paragraph' && a.kind !== 'quote')) return false;
  if (a.matter !== b.matter) return false;
  if (ENDS_SENTENCE.test(a.text)) return false;
  if (STARTS_LOWER.test(b.text)) return wordCount(a.text) >= 3;
  if (wordCount(a.text) < 6) return false; // e.g. a stray title line, not a cut sentence
  if (JOINER_END.test(a.text)) return true;
  // PDFs: a paragraph that runs off the bottom of a page without finishing its sentence.
  return a.page !== undefined && b.page === a.page + 1;
}

// ---------------------------------------------------------------------------
// 2. Table of contents

function anchorIndex(blocks: Block[]): Map<string, number> {
  const map = new Map<string, number>();
  blocks.forEach((b, i) => b.anchors?.forEach((a) => (map.has(a) ? null : map.set(a, i))));
  return map;
}

function titleMatches(blockText: string, title: string): boolean {
  const a = normalizeTitle(blockText);
  const t = normalizeTitle(title);
  if (!a || !t) return false;
  return a === t || a.startsWith(t) || t.startsWith(a) || (t.length > 6 && a.includes(t));
}

/** Map source TOC entries (anchors, PDF pages, titles) onto block indices. */
export function resolveToc(raw: RawTocEntry[], blocks: Block[]): TocEntry[] {
  const anchors = anchorIndex(blocks);
  const out: TocEntry[] = [];
  let cursor = 0;
  for (const e of raw) {
    const title = e.title.replace(/\s+/g, ' ').trim();
    if (!title) continue;
    let idx: number | undefined;
    if (e.anchor) {
      idx = anchors.get(e.anchor) ?? anchors.get(e.anchor.split('#')[0]);
    }
    if (idx === undefined && e.page != null) {
      const onPage: number[] = [];
      for (let i = 0; i < blocks.length; i++) {
        const p = blocks[i].page;
        if (p === undefined) continue;
        if (p === e.page) onPage.push(i);
        if (p > e.page) {
          if (!onPage.length) onPage.push(i);
          break;
        }
      }
      idx = onPage.find((i) => blocks[i].kind === 'heading' && titleMatches(blocks[i].text, title)) ?? onPage.find((i) => titleMatches(blocks[i].text, title)) ?? onPage[0];
    }
    if (idx === undefined) {
      // Title only: next matching heading after the previous entry.
      for (let i = cursor; i < blocks.length; i++) {
        if (blocks[i].kind === 'heading' && titleMatches(blocks[i].text, title)) {
          idx = i;
          break;
        }
      }
    }
    if (idx === undefined) continue;
    cursor = idx;
    const last = out[out.length - 1];
    if (last && last.block === idx && normalizeTitle(last.title) === normalizeTitle(title)) continue;
    out.push({ title, level: Math.max(1, Math.min(6, e.level || 1)), block: idx });
  }
  return out;
}

/** A printed contents list entry: "Chapter 1: The Harbor ........ 5" → "Chapter 1: The Harbor". */
function stripLeaders(t: string): string {
  return t
    .replace(/\s*(\.\s?){2,}\s*[\divxlc]*\s*$/i, '')
    .replace(/\s*…+\s*[\divxlc]*\s*$/i, '')
    .replace(/\s+\d{1,4}\s*$/, '')
    .trim();
}

/**
 * Find a printed "Contents" list near the start (for documents with no
 * built-in TOC). Marks those blocks as matter "toc" and returns its entries
 * mapped onto the matching headings later in the text.
 */
export function findPrintedToc(blocks: Block[]): { entries: TocEntry[]; tocBlocks: Set<number> } {
  const limit = Math.min(blocks.length, Math.max(8, Math.floor(blocks.length * 0.4)));
  const tocBlocks = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const b = blocks[i];
    if (b.matter === 'toc') tocBlocks.add(i);
    else if (/^(table of )?contents\b/i.test(b.text.trim()) && wordCount(b.text) <= 3) tocBlocks.add(i);
  }
  // Extend from a "Contents" title over the following short lines/blocks.
  for (const start of [...tocBlocks]) {
    // A contents list is contiguous, so it may run past the search window.
    for (let j = start + 1; j < blocks.length; j++) {
      const t = blocks[j].text;
      // Entries are short lines; stop at the first real heading or prose paragraph.
      const entryLike = blocks[j].kind !== 'heading' && wordCount(t) <= 14 && !ENDS_SENTENCE.test(t.replace(/\s*[\divxlc]+\s*$/i, ''));
      const listsChapters = (t.match(/\b(chapter|part|book)\s+[\divxlc]+\b/gi) ?? []).length >= 2;
      const leaders = /(\.\s?){3,}\s*[\divxlc]+\s*$/i.test(t);
      if (tocBlocks.has(j) || entryLike || leaders || listsChapters) tocBlocks.add(j);
      else break;
    }
  }
  if (!tocBlocks.size) return { entries: [], tocBlocks };

  // Entries = later headings whose titles appear in the printed list, in order.
  const lastToc = Math.max(...tocBlocks);
  const listed = ' ' + [...tocBlocks].map((i) => normalizeTitle(stripLeaders(blocks[i].text))).join(' | ') + ' ';
  const entries: TocEntry[] = [];
  const seen = new Set<string>();
  for (let k = lastToc + 1; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind !== 'heading') continue;
    const t = normalizeTitle(b.text);
    if (t.length < 3 || seen.has(t)) continue;
    if (listed.includes(` ${t} `) || listed.includes(` ${t} |`) || listed.includes(`| ${t} `)) {
      seen.add(t);
      entries.push({ title: b.text, level: b.level && b.level > 1 ? b.level - 1 : 1, block: k });
    }
  }
  return { entries, tocBlocks };
}

/** Fallback TOC: the document's own headings. */
function headingsToc(blocks: Block[]): TocEntry[] {
  const out: TocEntry[] = [];
  blocks.forEach((b, i) => {
    if (b.kind === 'heading' && wordCount(b.text) <= 16 && b.matter !== 'toc') {
      out.push({ title: b.text, level: b.level ?? 1, block: i });
    }
  });
  // Normalise levels so the shallowest heading is level 1.
  const min = Math.min(...out.map((e) => e.level));
  return out.length >= 2 ? out.map((e) => ({ ...e, level: e.level - min + 1 })) : [];
}

// ---------------------------------------------------------------------------
// 3. Content range

const GUTENBERG_START = /\*{3}\s*start of (the|this) project gutenberg/i;
const GUTENBERG_END = /\*{3}\s*end of (the|this) project gutenberg/i;

function sane(range: { start: number; end: number }, total: number): boolean {
  const kept = range.end - range.start;
  return range.start >= 0 && range.end <= total && kept > 0 && kept >= Math.min(total, Math.max(1, total * 0.3)) && range.start <= total * 0.6;
}

/** Range from TOC entries: first non-front entry → first entry of the trailing back-matter run. */
function rangeFromToc(toc: TocEntry[], blocks: Block[]): { start: number; end: number } | null {
  if (toc.length < 2) return null;
  const classes = toc.map((e) => classifyTitle(e.title));
  // Only top-level-ish entries decide the range.
  const firstContent = toc.findIndex((e, i) => classes[i] !== 'front' && classes[i] !== 'either');
  if (firstContent < 0) return null;
  let end = blocks.length;
  for (let i = toc.length - 1; i > firstContent; i--) {
    if (classes[i] === 'back' || classes[i] === 'either') end = toc[i].block;
    else break;
  }
  return { start: toc[firstContent].block, end };
}

/** Heuristic range for documents without a usable TOC. */
function rangeFromHeuristics(blocks: Block[], tocBlocks: Set<number>): { start: number; end: number } {
  const n = blocks.length;
  const frontLimit = Math.min(n, Math.max(30, Math.floor(n * 0.35)));
  let frontEnd = -1; // last block index judged to be front matter

  // Sections introduced by a front-matter heading ("Copyright", "Dedication"…).
  let inFrontSection = false;
  for (let i = 0; i < frontLimit; i++) {
    const b = blocks[i];
    if (b.kind === 'heading') {
      const c = classifyTitle(b.text);
      inFrontSection = c === 'front' || c === 'either';
      if (c === 'start' && frontEnd >= 0) break;
    }
    const legal = legalScore(b.text);
    const isFront = inFrontSection || b.matter === 'front' || b.matter === 'toc' || tocBlocks.has(i) || legal >= 2 || (legal >= 1 && wordCount(b.text) < 60);
    if (isFront) frontEnd = i;
  }

  let start = frontEnd + 1;
  if (frontEnd >= 0) {
    // Skip leftover title-page style fragments between front matter and the first real heading.
    for (let i = start; i < Math.min(n, start + 6); i++) {
      if (blocks[i].kind === 'heading' && classifyTitle(blocks[i].text) !== 'front') {
        start = i;
        break;
      }
      if (blocks[i].kind === 'paragraph' && wordCount(blocks[i].text) > 25) break;
    }
  } else {
    // No front matter found: skip a title page (a few short lines) before the first chapter heading.
    const firstChapter = blocks.findIndex((b, i) => i < frontLimit && b.kind === 'heading' && classifyTitle(b.text) === 'start');
    if (firstChapter > 0 && blocks.slice(0, firstChapter).every((b) => wordCount(b.text) <= 12)) start = firstChapter;
    else start = 0;
  }

  // Back matter: a back-matter heading in the second half after which no chapter starts.
  let end = n;
  for (let i = n - 1; i >= Math.max(start + 1, Math.floor(n * 0.5)); i--) {
    const b = blocks[i];
    if (b.matter === 'back') {
      end = i;
      continue;
    }
    if (b.kind !== 'heading') continue;
    const c = classifyTitle(b.text);
    if (c === 'back' || c === 'either') end = i;
    else if (c === 'start') break;
  }
  // Trailing copyright / legal block(s).
  while (end - 1 > start && legalScore(blocks[end - 1].text) >= 2) end--;
  return { start, end };
}

// ---------------------------------------------------------------------------

export function analyzeDocument(doc: Pick<ParsedDocument, 'blocks' | 'toc' | 'bodyStartAnchor'>): AnalyzedDocument {
  let blocks = mergeBrokenParagraphs(doc.blocks);
  const n = blocks.length;

  // Table of contents: built-in → printed → headings.
  let toc: TocEntry[] = doc.toc?.length ? resolveToc(doc.toc, blocks) : [];
  const printed = findPrintedToc(blocks);
  if (toc.length < 2 && printed.entries.length >= 2) toc = printed.entries;
  // A TOC from the source (or a printed contents list) can define the content range;
  // one rebuilt from headings can't (it includes title-page headings etc.).
  const tocIsAuthoritative = toc.length >= 2;
  if (toc.length < 2) toc = headingsToc(blocks);

  // Content range: explicit markers → EPUB landmarks → TOC → heuristics.
  let range: { start: number; end: number } | null = null;
  let source: ContentRange['source'] = 'none';

  const gStart = blocks.findIndex((b) => GUTENBERG_START.test(b.text));
  const gEnd = blocks.findIndex((b) => GUTENBERG_END.test(b.text));
  if (gStart >= 0 || gEnd >= 0) {
    range = { start: gStart >= 0 ? gStart + 1 : 0, end: gEnd > gStart ? gEnd : n };
    source = 'markers';
    // Inside the Gutenberg text there may still be a title page + contents: refine the start.
    const inner = rangeFromHeuristics(blocks.slice(range.start, range.end), new Set([...printed.tocBlocks].filter((i) => i >= range!.start).map((i) => i - range!.start)));
    if (inner.start > 0 && inner.start < (range.end - range.start) * 0.6) range = { start: range.start + inner.start, end: range.end };
  }

  if (!range && doc.bodyStartAnchor) {
    const anchors = anchorIndex(blocks);
    const s = anchors.get(doc.bodyStartAnchor) ?? anchors.get(doc.bodyStartAnchor.split('#')[0]);
    if (s !== undefined) {
      const fromToc = rangeFromToc(toc, blocks);
      range = { start: s, end: fromToc && fromToc.end > s ? fromToc.end : rangeFromHeuristics(blocks, printed.tocBlocks).end };
      source = 'landmarks';
    }
  }

  if (!range && tocIsAuthoritative) {
    const fromToc = rangeFromToc(toc, blocks);
    if (fromToc && sane(fromToc, n)) {
      range = fromToc;
      source = 'toc';
    }
  }

  if (!range) {
    const h = rangeFromHeuristics(blocks, printed.tocBlocks);
    if (h.start > 0 || h.end < n) {
      range = h;
      source = 'heuristic';
    }
  }

  if (!range || !sane(range, n)) {
    range = { start: 0, end: n };
    source = 'none';
  }

  const content: ContentRange = { ...range, source };
  toc = toc.map((e) => (e.block < content.start || e.block >= content.end ? { ...e, skipped: true } : e));
  blocks = blocks.map(({ anchors: _a, ...rest }) => rest);
  return { blocks, toc, content };
}
