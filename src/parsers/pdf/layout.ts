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
  const pageH = median(page.items.filter((i) => i.str.trim().length > 1).map((i) => i.h));
  // Drop footnote reference markers (small raised "1", "*", "†") so they don't split lines.
  const items = page.items.filter(
    (i) => i.str.length > 0 && i.h > 0 && !(pageH && i.h < pageH * 0.9 &&/^\s*[\d*†‡§]{1,3}\s*$/.test(i.str)),
  );
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

const ENDS_SENTENCE = /([.!?…:]|[.!?…]["”’)\]»]+)$/;
const PAGE_REF = /((\.\s?){3,}|…+|\s)\s*(\d{1,4}|[ivxlc]{1,7})$/i;

function joinLine(acc: string, next: string): string {
  if (!acc) return next;
  // De-hyphenate words split across lines: "exam-" + "ple" → "example".
  if (/[A-Za-zÀ-ɏ]-$/.test(acc) && /^[a-zß-ÿ]/.test(next)) return acc.slice(0, -1) + next;
  return acc + ' ' + next;
}

/** A printed contents page: most lines end in a page number (often after dot leaders). */
export function isTocPage(lines: Line[]): boolean {
  const body = lines.filter((l) => l.text.length > 2);
  if (body.length < 3) return false;
  const refs = body.filter((l) => PAGE_REF.test(l.text) && !/[.!?]["”’]?$/.test(l.text.replace(PAGE_REF, ''))).length;
  const hasTitle = body.some((l) => /^(table of )?contents$/i.test(l.text.trim()));
  return refs >= 3 && refs / body.length >= (hasTitle ? 0.45 : 0.6);
}

/**
 * Footnotes: smaller-type lines below the last body-size line on a page.
 * They interrupt paragraphs that continue onto the next page, so drop them.
 */
export function dropFootnotes(lines: Line[], bodyH: number): Line[] {
  const bodyLines = lines.filter((l) => Math.abs(l.h - bodyH) <= bodyH * 0.12);
  if (!bodyLines.length) return lines;
  const lastBodyY = Math.max(...bodyLines.map((l) => l.y));
  return lines.filter((l) => !(l.y > lastBodyY && l.h < bodyH * 0.9));
}

/**
 * Rebuild reading paragraphs from page lines using vertical gaps, indentation,
 * short final lines and font-size jumps (headings). Paragraphs that run over a
 * page break — mid-sentence or not — are joined back together.
 */
export function pdfPagesToBlocks(pages: PdfPage[]): ParsedDocument {
  const rawLines = pages.map((p, i) => buildLines(p, i));
  const stripped = stripRunningHeaders(rawLines, pages.map((p) => p.height));
  const allRaw = stripped.flat();
  if (!allRaw.length) return { blocks: [] };

  const bodyH = median(allRaw.map((l) => l.h));
  const lines = stripped.map((pl) => dropFootnotes(pl, bodyH));
  const tocPages = new Set(lines.map((pl, i) => (isTocPage(pl) ? i : -1)).filter((i) => i >= 0));
  const all = lines.flat();

  const gaps: number[] = [];
  for (const pl of lines) for (let i = 1; i < pl.length; i++) {
    const g = pl[i].y - pl[i - 1].y;
    if (g > 0 && Math.abs(pl[i].h - bodyH) < bodyH * 0.15) gaps.push(g);
  }
  const lineGap = median(gaps) || bodyH * 1.2;
  const bodyLinesAll = all.filter((l) => Math.abs(l.h - bodyH) < bodyH * 0.15);
  const leftX = percentile(bodyLinesAll.map((l) => l.x), 0.15);
  const rightX = percentile(bodyLinesAll.map((l) => l.xEnd), 0.85);
  const width = Math.max(1, rightX - leftX);

  const blocks: Block[] = [];
  let current: Block | null = null;
  let prev: Line | null = null;

  const flush = () => {
    if (current?.text) blocks.push(current);
    current = null;
  };

  for (const line of all) {
    // Printed contents pages: one entry per line, marked so it is skipped and parsed as a TOC.
    if (tocPages.has(line.page)) {
      flush();
      blocks.push({ kind: line.h > bodyH * 1.2 ? 'heading' : 'paragraph', ...(line.h > bodyH * 1.2 ? { level: 2 } : {}), text: line.text, page: line.page, matter: 'toc' });
      prev = line;
      continue;
    }

    const isHeading = line.h > bodyH * 1.2 && line.text.length < 160;
    if (isHeading) {
      const continuing = current && current.kind === 'heading' && prev && prev.page === line.page && line.y - prev.y < line.h * 1.8;
      if (!continuing) {
        flush();
        current = { kind: 'heading', level: line.h > bodyH * 1.6 ? 1 : 2, text: '', page: line.page };
      }
      current!.text = joinLine(current!.text, line.text);
      prev = line;
      continue;
    }

    let startNew = !current || current.kind === 'heading';
    if (!startNew && prev) {
      const prevShort = prev.xEnd < rightX - width * 0.12;
      const indented = line.x > leftX + bodyH * 1.0 && line.x - leftX > bodyH * 0.8;
      const prevEnds = ENDS_SENTENCE.test(prev.text);
      if (line.page === prev.page) {
        const gap = line.y - prev.y;
        if (gap > lineGap * 1.45 || gap < 0) startNew = true; // gap < 0: new column
        else if (indented && line.x - prev.x > bodyH * 0.8) startNew = true;
        else if (prevShort && prevEnds) startNew = true;
        else if (Math.abs(line.h - prev.h) > bodyH * 0.2) startNew = true;
      } else {
        // Page break. A paragraph whose last line runs to the margin without
        // finishing its sentence continues on the next page. One that stops at a
        // sentence end continues too, unless the last line was short (the
        // paragraph ended) or the new page starts with an indent.
        if (!prevEnds) startNew = (prevShort && !/^[a-z]/.test(line.text)) || Math.abs(line.h - prev.h) > bodyH * 0.2;
        else startNew = prevShort || indented;
      }
    }
    if (startNew) {
      flush();
      const bullet = /^[•●▪◦‣\-–]\s/.test(line.text);
      current = { kind: bullet ? 'list' : 'paragraph', text: '', page: line.page };
      current.text = bullet ? line.text.replace(/^[•●▪◦‣\-–]\s+/, '') : '';
      if (bullet) {
        prev = line;
        continue;
      }
    }
    current!.text = joinLine(current!.text, line.text);
    prev = line;
  }
  flush();
  return { blocks: finalizeBlocks(blocks) };
}
