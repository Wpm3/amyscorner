import { readFileSync } from 'fs';
import { join } from 'path';
import { pdfPagesToBlocks } from '../src/parsers/pdf/layout';
import type { Block, TocEntry } from '../src/text/blocks';
import { blockOffsets, detectChapters, readingProgress } from '../src/text/chapters';
import { analyzeDocument } from '../src/text/structure';

const p = (text: string): Block => ({ kind: 'paragraph', text });
const h = (text: string, level = 1): Block => ({ kind: 'heading', level, text });
const prose = (n: number, tag = 'x') => Array.from({ length: n }, (_, i) => p(`Sentence ${tag}${i} goes on for a little while. Then another one follows it.`));
const toc = (entries: [string, number, number, boolean?][]): TocEntry[] => entries.map(([title, level, block, skipped]) => ({ title, level, block, ...(skipped ? { skipped } : {}) }));

describe('analyzeDocument tocSource', () => {
  const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

  it('reports where the table of contents came from', () => {
    const { pages, outline } = fixture('book-outline.json');
    expect(analyzeDocument({ ...pdfPagesToBlocks(pages), toc: outline }).tocSource).toBe('builtin');
    expect(analyzeDocument(pdfPagesToBlocks(fixture('book-plain.json').pages)).tocSource).toBe('printed');
    expect(analyzeDocument({ blocks: [h('One'), ...prose(3), h('Two'), ...prose(3)] }).tocSource).toBe('headings');
    expect(analyzeDocument({ blocks: prose(5) }).tocSource).toBe('none');
  });
});

describe('detectChapters', () => {
  it('uses built-in TOC entries inside the reading range', () => {
    const blocks = [h('Copyright'), p('All rights reserved.'), h('Chapter 1'), ...prose(4), h('Chapter 2'), ...prose(4), h('Index'), p('a, 1')];
    const info = detectChapters({
      blocks,
      toc: toc([['Copyright', 1, 0, true], ['Chapter 1', 1, 2], ['Chapter 2', 1, 7], ['Index', 1, 12, true]]),
      content: { start: 2, end: 12, source: 'toc' },
      tocSource: 'builtin',
    });
    expect(info).toEqual({ kind: 'chapter', chapters: [{ title: 'Chapter 1', start: 2, end: 7 }, { title: 'Chapter 2', start: 7, end: 12 }] });
  });

  it('descends from Part containers to the chapters inside them', () => {
    const blocks = [h('Part One'), h('Chapter 1', 2), ...prose(3), h('Chapter 2', 2), ...prose(3), h('Part Two'), h('Chapter 3', 2), ...prose(3)];
    const info = detectChapters({
      blocks,
      toc: toc([['Part One', 1, 0], ['Chapter 1', 2, 1], ['Chapter 2', 2, 5], ['Part Two', 1, 9], ['Chapter 3', 2, 10]]),
      content: { start: 0, end: blocks.length, source: 'none' },
      tocSource: 'builtin',
    });
    expect(info?.kind).toBe('chapter');
    expect(info?.chapters.map((c) => [c.title, c.start, c.end])).toEqual([
      ['Chapter 1', 0, 5], // stretched back to cover the "Part One" heading
      ['Chapter 2', 5, 10],
      ['Chapter 3', 10, 14],
    ]);
  });

  it('calls headed sections "sections" when the titles are not chapter-like', () => {
    const blocks = [h('Getting started'), ...prose(4), h('Settings'), ...prose(4), h('Importing files'), ...prose(4)];
    const a = analyzeDocument({ blocks });
    expect(detectChapters({ ...a })?.kind).toBe('section');
  });

  it('finds no chapters in a document without any', () => {
    const a = analyzeDocument({ blocks: prose(12) });
    expect(detectChapters(a)).toBeNull();
  });

  it('finds no chapters when there is only one', () => {
    const a = analyzeDocument({ blocks: [h('Chapter 1'), ...prose(10)] });
    expect(detectChapters(a)).toBeNull();
  });

  it('rejects headings that do not divide the text (most of it comes before them)', () => {
    const a = analyzeDocument({ blocks: [...prose(30), h('Notes on sources'), ...prose(2), h('A short coda'), ...prose(2)] });
    expect(detectChapters(a)).toBeNull();
  });

  it('rejects headings that are nearly every other block (labels, not chapters)', () => {
    const blocks: Block[] = [];
    for (let i = 0; i < 10; i++) blocks.push(h(`Term ${i}`), p(`Definition number ${i} of the glossary.`));
    expect(detectChapters(analyzeDocument({ blocks }))).toBeNull();
  });

  it('trusts a built-in TOC even when chapters are short', () => {
    const blocks = [h('Chapter 1'), p('Short.'), h('Chapter 2'), p('Also short.')];
    const info = detectChapters({
      blocks,
      toc: toc([['Chapter 1', 1, 0], ['Chapter 2', 1, 2]]),
      content: { start: 0, end: 4, source: 'none' },
      tocSource: 'builtin',
    });
    expect(info?.chapters).toHaveLength(2);
  });
});

describe('readingProgress', () => {
  // Four blocks of 100, 300, 100, 500 characters → offsets 0,100,400,500,1000.
  const blocks = [100, 300, 100, 500].map((n) => p('x'.repeat(n)));
  const offsets = blockOffsets(blocks);
  const chapters = [
    { title: 'One', start: 0, end: 2 },
    { title: 'Two', start: 2, end: 4 },
  ];

  it('measures by amount of text, not block count', () => {
    expect(offsets).toEqual([0, 100, 400, 500, 1000]);
    const r = readingProgress(offsets, { block: 1, fraction: 1 }, { start: 0, end: 4 }, chapters);
    expect(r.document).toBeCloseTo(0.4);
    expect(r.chapter).toEqual({ index: 0, total: 2, title: 'One', fraction: 1 });
  });

  it('counts the revealed part of the current paragraph', () => {
    const r = readingProgress(offsets, { block: 3, fraction: 0.5 }, { start: 0, end: 4 }, chapters);
    expect(r.document).toBeCloseTo(0.75);
    expect(r.chapter?.index).toBe(1);
    expect(r.chapter?.fraction).toBeCloseTo((100 + 250) / 600);
  });

  it('is relative to the reading range (skipped front/back matter excluded)', () => {
    const r = readingProgress(offsets, { block: 2, fraction: 0 }, { start: 1, end: 3 }, null);
    expect(r.document).toBeCloseTo(300 / 400);
    expect(r.chapter).toBeNull();
  });

  it('has no chapter progress outside every chapter', () => {
    const r = readingProgress(offsets, { block: 0, fraction: 0 }, { start: 0, end: 4 }, [{ title: 'Two', start: 2, end: 4 }]);
    expect(r.chapter).toBeNull();
  });

  it('clamps to 0..1', () => {
    expect(readingProgress(offsets, { block: 9, fraction: 1 }, { start: 0, end: 4 }, null).document).toBe(1);
    expect(readingProgress(offsets, { block: 0, fraction: -1 }, { start: 0, end: 4 }, null).document).toBe(0);
  });
});

describe('real documents', () => {
  it('finds the three chapters of the bookmarked PDF and nothing from front/back matter', () => {
    const { pages, outline } = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'book-outline.json'), 'utf8'));
    const a = analyzeDocument({ ...pdfPagesToBlocks(pages), toc: outline });
    const info = detectChapters(a);
    expect(info?.kind).toBe('chapter');
    expect(info?.chapters.map((c) => c.title)).toEqual(['Chapter 1: The Harbor', 'Chapter 2: The Storm', 'Chapter 3: Morning']);
    expect(info?.chapters[0].start).toBe(a.content.start);
    expect(info?.chapters[2].end).toBe(a.content.end);
  });
});

describe('upgradeBook (books saved by an older version)', () => {
  const { upgradeBook } = require('../src/text/structure');
  const blocks = [h('Copyright'), p('All rights reserved.'), h('Chapter 1'), ...prose(3), h('Chapter 2'), ...prose(3)];

  it('keeps a v1 book’s saved TOC and range, adding tocSource', () => {
    const v1 = { blocks, toc: toc([['Copyright', 1, 0, true], ['The Harbor', 1, 2], ['The Storm', 1, 6]]), content: { start: 2, end: 10, source: 'toc' }, structureVersion: 1 };
    const up = upgradeBook(v1);
    expect(up.toc).toBe(v1.toc);
    expect(up.content).toBe(v1.content);
    expect(up.tocSource).toBe('builtin'); // titles differ from the headings → came from the file
    expect(up.structureVersion).toBe(2);
  });

  it('marks a v1 TOC that simply mirrors the headings as a guess', () => {
    const v1 = { blocks, toc: toc([['Copyright', 1, 0], ['Chapter 1', 1, 2], ['Chapter 2', 1, 6]]), content: { start: 0, end: 10, source: 'none' }, structureVersion: 1 };
    expect(upgradeBook(v1).tocSource).toBe('headings');
  });

  it('fully analyses a book saved before structure detection', () => {
    const up = upgradeBook({ blocks });
    expect(up.structureVersion).toBe(2);
    expect(up.content).toBeDefined();
    expect(up.tocSource).toBe('headings');
  });
});
