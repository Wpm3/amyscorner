import type { Block, ParsedDocument } from '../../text/blocks';
import { finalizeBlocks } from '../../text/clean';
import type { PdfPage, PdfTextItem } from './types';

interface Line {
  text: string;
  x: number;
  xEnd: number;
  y: number;
  h: number;
  page: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

/** Group positioned items into visual lines, left-to-right. */
export function buildLines(page: PdfPage, pageIndex: number): Line[] {
  const items = page.items.filter((i) => i.str.length > 0 && i.h > 0);
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: PdfTextItem[][] = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g[0].y - it.y) < Math.max(g[0].h, it.h) * 0.5) g.push(it);
    else groups.push([it]);
  }
  const lines: Line[] = [];
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = -Infinity;
    for (const it of g) {
      const gap = it.x - prevEnd;
      if (text && gap > it.h * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str;
      prevEnd = it.x + it.w;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    lines.push({
      text,
      x: g[0].x,
      xEnd: Math.max(...g.map((i) => i.x + i.w)),
      y: median(g.map((i) => i.y)),
      h: median(g.map((i) => i.h)),
      page: pageIndex,
    });
  }
  return lines;
}

const PAGE_NUMBER = /^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
const normalizeRunning = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** Remove running headers/footers and bare page numbers that sit in the top/bottom margins. */
export function stripRunningHeaders(pages: Line[][], heights: number[]): Line[][] {
  const counts = new Map<string, number>();
  const inMargin = (l: Line) => l.y < heights[l.page] * 0.09 || l.y > heights[l.page] * 0.91;
  for (const lines of pages) {
    const seen = new Set<string>();
    for (const l of lines) if (inMargin(l)) seen.add(normalizeRunning(l.text));
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.min(3, Math.ceil(pages.length * 0.3)));
  return pages.map((lines) =>
    lines.filter((l) => {
      if (!inMargin(l)) return true;
      if (PAGE_NUMBER.test(l.text)) return false;
      return (counts.get(normalizeRunning(l.text)) ?? 0) < threshold;
    }),
  );
}

const ENDS_SENTENCE = /[.!?…:"”’)\]]$/;

function joinLine(acc: string, next: string): string {
  if (!acc) return next;
  // De-hyphenate words split across lines: "exam-" + "ple" → "example".
  if (/[A-Za-zÀ-ɏ]-$/.test(acc) && /^[a-zß-ÿ]/.test(next)) return acc.slice(0, -1) + next;
  return acc + ' ' + next;
}

/**
 * Rebuild reading paragraphs from page lines using vertical gaps, indentation,
 * short final lines and font-size jumps (headings).
 */
export function pdfPagesToBlocks(pages: PdfPage[]): ParsedDocument {
  const rawLines = pages.map((p, i) => buildLines(p, i));
  const lines = stripRunningHeaders(rawLines, pages.map((p) => p.height));
  const all = lines.flat();
  if (!all.length) return { blocks: [] };

  const bodyH = median(all.map((l) => l.h));
  const gaps: number[] = [];
  for (const pl of lines) for (let i = 1; i < pl.length; i++) {
    const g = pl[i].y - pl[i - 1].y;
    if (g > 0 && Math.abs(pl[i].h - bodyH) < bodyH * 0.15) gaps.push(g);
  }
  const lineGap = median(gaps) || bodyH * 1.2;
  const leftX = percentile(all.map((l) => l.x), 0.15);
  const rightX = percentile(all.map((l) => l.xEnd), 0.85);
  const width = Math.max(1, rightX - leftX);

  const blocks: Block[] = [];
  let current: { kind: Block['kind']; text: string; level?: number } | null = null;
  let prev: Line | null = null;

  const flush = () => {
    if (current?.text) blocks.push(current);
    current = null;
  };

  for (const line of all) {
    const isHeading = line.h > bodyH * 1.2 && line.text.length < 160;
    if (isHeading) {
      const continuing = current && current.kind === 'heading' && prev && prev.page === line.page && line.y - prev.y < line.h * 1.8;
      if (!continuing) {
        flush();
        current = { kind: 'heading', level: line.h > bodyH * 1.6 ? 1 : 2, text: '' };
      }
      current!.text = joinLine(current!.text, line.text);
      prev = line;
      continue;
    }

    let startNew = !current || current.kind === 'heading';
    if (!startNew && prev) {
      const prevShort = prev.xEnd < rightX - width * 0.12;
      const indented = line.x > leftX + bodyH * 1.0 && line.x - prev.x > bodyH * 0.8;
      if (line.page === prev.page) {
        const gap = line.y - prev.y;
        if (gap > lineGap * 1.45 || gap < 0) startNew = true; // gap < 0: new column
        else if (indented) startNew = true;
        else if (prevShort && ENDS_SENTENCE.test(prev.text)) startNew = true;
        else if (Math.abs(line.h - prev.h) > bodyH * 0.2) startNew = true;
      } else {
        // Page break: continue the paragraph only if the previous one clearly ran on.
        if (ENDS_SENTENCE.test(prev.text) && (prevShort || indented)) startNew = true;
        else if (indented) startNew = true;
      }
    }
    if (startNew) {
      flush();
      current = { kind: /^[•●▪◦‣\-–]\s/.test(line.text) ? 'list' : 'paragraph', text: '' };
    }
    current!.text = joinLine(current!.text, current!.kind === 'list' && !current!.text ? line.text.replace(/^[•●▪◦‣\-–]\s+/, '') : line.text);
    prev = line;
  }
  flush();
  return { blocks: finalizeBlocks(blocks) };
}
