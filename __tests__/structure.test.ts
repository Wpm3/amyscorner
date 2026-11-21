import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBytes } from '../src/parsers';
import { pdfPagesToBlocks } from '../src/parsers/pdf/layout';
import type { Block } from '../src/text/blocks';
import { analyzeDocument, classifyTitle, mergeBrokenParagraphs } from '../src/text/structure';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
const textOf = (blocks: Block[], i: number) => blocks[i]?.text ?? '';
const p = (text: string, extra: Partial<Block> = {}): Block => ({ kind: 'paragraph', text, ...extra });
const h = (text: string, level = 1): Block => ({ kind: 'heading', level, text });

describe('PDF with built-in bookmarks', () => {
  const { pages, outline } = fixture('book-outline.json');
  const a = analyzeDocument({ ...pdfPagesToBlocks(pages), toc: outline });

  it('starts at Chapter 1 and stops before the back matter', () => {
    expect(textOf(a.blocks, a.content.start)).toBe('Chapter 1: The Harbor');
    expect(textOf(a.blocks, a.content.end)).toBe('Acknowledgments');
    expect(a.content.source).toBe('toc');
  });

  it('builds a TOC from the bookmarks and marks front/back matter as skipped', () => {
    expect(a.toc.map((e) => [e.title, !!e.skipped])).toEqual([
      ['Cover', true],
      ['Copyright', true],
      ['Dedication', true],
      ['Contents', true],
      ['Chapter 1: The Harbor', false],
      ['Chapter 2: The Storm', false],
      ['Chapter 3: Morning', false],
      ['Acknowledgments', true],
      ['About the Author', true],
      ['Index', true],
    ]);
    for (const e of a.toc) expect(a.blocks[e.block]).toBeDefined();
    expect(textOf(a.blocks, a.toc[5].block)).toBe('Chapter 2: The Storm');
  });

  it('joins paragraphs that continue across a page break', () => {
    const body = a.blocks.slice(a.content.start, a.content.end).filter((b) => b.kind === 'paragraph');
    // Every paragraph of the story ends a sentence: nothing was left cut at a page bottom.
    for (const b of body) expect(b.text).toMatch(/[.!?]$/);
    // A sentence that straddles pages 5 and 6 is whole again.
    expect(body.some((b) => /because the count was the only thing that never changed on the island\. The keeper/.test(b.text))).toBe(true);
  });

  it('drops footnotes and their reference markers', () => {
    const all = a.blocks.map((b) => b.text).join('\n');
    expect(all).not.toMatch(/converted to electricity/);
    expect(all).toMatch(/stopped to watch it turn\. That was the story, at least\./);
  });
});

describe('PDF without bookmarks', () => {
  const { pages } = fixture('book-plain.json');
  const a = analyzeDocument(pdfPagesToBlocks(pages));

  it('finds the printed contents page and uses it for the TOC and range', () => {
    expect(a.toc.map((e) => e.title)).toEqual(['Chapter 1: The Harbor', 'Chapter 2: The Storm', 'Chapter 3: Morning', 'Acknowledgments', 'About the Author', 'Index']);
    expect(textOf(a.blocks, a.content.start)).toBe('Chapter 1: The Harbor');
    expect(textOf(a.blocks, a.content.end)).toBe('Acknowledgments');
  });

  it('falls back to heuristics when there is no contents page at all', () => {
    const noToc = pdfPagesToBlocks(pages.filter((_: unknown, i: number) => i !== 3)); // remove the contents page
    const b = analyzeDocument(noToc);
    expect(b.content.source).toBe('heuristic');
    expect(textOf(b.blocks, b.content.start)).toBe('Chapter 1: The Harbor');
    expect(textOf(b.blocks, b.content.end)).toBe('Acknowledgments');
    expect(b.toc.map((e) => e.title)).toContain('Chapter 2: The Storm');
  });
});

describe('heuristics on plain blocks', () => {
  it('skips a title page, copyright and dedication before the first chapter', () => {
    const blocks = [
      h('A Quiet Year'),
      p('by Sam Writer'),
      p('Copyright © 2021 Sam Writer. All rights reserved. ISBN 978-0-00-000000-0. Published by Small Press.'),
      p('For Ada.'),
      h('Chapter One'),
      ...Array.from({ length: 12 }, (_, i) => p(`This is sentence number ${i} of a story that keeps going for a while.`)),
      h('About the Author'),
      p('Sam lives by the sea.'),
    ];
    const a = analyzeDocument({ blocks });
    expect(textOf(a.blocks, a.content.start)).toBe('Chapter One');
    expect(textOf(a.blocks, a.content.end)).toBe('About the Author');
  });

  it('keeps everything when there is no front or back matter', () => {
    const blocks = [p('Just an essay. It starts right away.'), p('And it keeps going.'), p('Then it ends.')];
    expect(analyzeDocument({ blocks }).content).toEqual({ start: 0, end: 3, source: 'none' });
  });

  it('classifies common front/back matter titles', () => {
    expect(classifyTitle('Copyright Page')).toBe('front');
    expect(classifyTitle('Table of Contents')).toBe('front');
    expect(classifyTitle('ABOUT THE AUTHOR')).toBe('back');
    expect(classifyTitle('Acknowledgments')).toBe('either');
    expect(classifyTitle('Chapter 12')).toBe('start');
    expect(classifyTitle('The Long Night')).toBe('other');
  });
});

describe('mergeBrokenParagraphs', () => {
  it('joins a sentence cut by a break', () => {
    const out = mergeBrokenParagraphs([p('She walked down to the harbor and looked out at the'), p('boats bobbing in the grey water.')]);
    expect(out.map((b) => b.text)).toEqual(['She walked down to the harbor and looked out at the boats bobbing in the grey water.']);
  });

  it('joins dialogue split before its tag', () => {
    const out = mergeBrokenParagraphs([p('“Come inside before the storm breaks,”'), p('she said, holding the door.')]);
    expect(out).toHaveLength(1);
  });

  it('re-joins hyphenated words', () => {
    const out = mergeBrokenParagraphs([p('The keeper had always been extra-'), p('ordinarily careful with the lamp.')]);
    expect(out[0].text).toBe('The keeper had always been extraordinarily careful with the lamp.');
  });

  it('leaves complete paragraphs, headings and short titles alone', () => {
    expect(mergeBrokenParagraphs([p('It was late.'), p('the next one starts oddly.')])).toHaveLength(2);
    expect(mergeBrokenParagraphs([h('Chapter One'), p('it began.')])).toHaveLength(2);
    expect(mergeBrokenParagraphs([p('Jane Doe'), p('Copyright 2024')])).toHaveLength(2);
  });

  it('joins across consecutive PDF pages when the sentence is unfinished', () => {
    const out = mergeBrokenParagraphs([p('By midnight the waves were breaking over the lower gallery and', { page: 3 }), p('The keeper tied himself to the rail.', { page: 4 })]);
    expect(out).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

const xhtml = (body: string, bodyAttrs = '') =>
  strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body ${bodyAttrs}>${body}</body></html>`);

describe('EPUB 3 (nav + landmarks + epub:type)', () => {
  const zip = zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8(`<package version="3.0"><metadata><title>Keeper</title></metadata><manifest>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
      <item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>
      <item id="copy" href="text/copyright.xhtml" media-type="application/xhtml+xml"/>
      <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
      <item id="c1b" href="text/ch1b.xhtml" media-type="application/xhtml+xml"/>
      <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
      <item id="about" href="text/about.xhtml" media-type="application/xhtml+xml"/>
      </manifest><spine><itemref idref="title"/><itemref idref="copy"/><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c1b"/><itemref idref="c2"/><itemref idref="about"/></spine></package>`),
    'OEBPS/nav.xhtml': strToU8(`<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
      <nav epub:type="toc"><h1>Contents</h1><ol>
        <li><a href="text/copyright.xhtml">Copyright</a></li>
        <li><a href="text/ch1.xhtml#c1">Part One</a><ol><li><a href="text/ch1.xhtml#s2">The Harbor</a></li></ol></li>
        <li><a href="text/ch2.xhtml">Part Two</a></li>
        <li><a href="text/about.xhtml">About the Author</a></li>
      </ol></nav>
      <nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="text/ch1.xhtml#c1">Start</a></li></ol></nav></body></html>`),
    'OEBPS/text/title.xhtml': xhtml('<h1>Keeper</h1><p>A novel</p>', 'epub:type="frontmatter titlepage"'),
    'OEBPS/text/copyright.xhtml': xhtml('<section epub:type="copyright-page"><p>Copyright 2024. All rights reserved.</p></section>'),
    'OEBPS/text/ch1.xhtml': xhtml(
      '<section id="c1"><h1>Part One</h1><p>The keeper climbed the stairs.<a epub:type="noteref" href="#n1">1</a></p><h2 id="s2">The Harbor</h2><p>He looked out over the water and saw that the</p></section><aside epub:type="footnote" id="n1"><p>A footnote.</p></aside>',
    ),
    'OEBPS/text/ch1b.xhtml': xhtml('<p>fishing boats were already coming home.</p><p>Then night fell.</p>'),
    'OEBPS/text/ch2.xhtml': xhtml('<h1>Part Two</h1><p>Morning came.</p>'),
    'OEBPS/text/about.xhtml': xhtml('<section epub:type="backmatter"><h1>About the Author</h1><p>She lives by the sea.</p></section>'),
  });
  const doc = parseBytes('epub', zip);
  const a = analyzeDocument(doc);

  it('starts at the bodymatter landmark and ends before back matter', () => {
    expect(a.content.source).toBe('landmarks');
    expect(textOf(a.blocks, a.content.start)).toBe('Part One');
    expect(textOf(a.blocks, a.content.end)).toBe('About the Author');
  });

  it('maps nested nav entries onto blocks', () => {
    expect(a.toc.map((e) => [e.title, e.level, textOf(a.blocks, e.block), !!e.skipped])).toEqual([
      ['Copyright', 1, 'Copyright 2024. All rights reserved.', true],
      ['Part One', 1, 'Part One', false],
      ['The Harbor', 2, 'The Harbor', false],
      ['Part Two', 1, 'Part Two', false],
      ['About the Author', 1, 'About the Author', true],
    ]);
  });

  it('joins a paragraph split across two files and drops footnotes', () => {
    const all = a.blocks.map((b) => b.text);
    expect(all).toContain('He looked out over the water and saw that the fishing boats were already coming home.');
    expect(all).toContain('The keeper climbed the stairs.');
    expect(all.join(' ')).not.toMatch(/A footnote/);
    expect(a.blocks.some((b) => 'anchors' in b)).toBe(false);
  });
});

describe('EPUB 2 (NCX + guide)', () => {
  const zip = zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),
    'content.opf': strToU8(`<package version="2.0"><metadata><title>Old</title></metadata><manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="t" href="title.html" media-type="application/xhtml+xml"/>
      <item id="a" href="a.html" media-type="application/xhtml+xml"/>
      <item id="b" href="b.html" media-type="application/xhtml+xml"/></manifest>
      <spine toc="ncx"><itemref idref="t"/><itemref idref="a"/><itemref idref="b"/></spine>
      <guide><reference type="text" href="a.html"/></guide></package>`),
    'toc.ncx': strToU8(`<ncx><navMap>
      <navPoint><navLabel><text>Title Page</text></navLabel><content src="title.html"/></navPoint>
      <navPoint><navLabel><text>Chapter I</text></navLabel><content src="a.html"/>
        <navPoint><navLabel><text>A section</text></navLabel><content src="a.html#sec"/></navPoint></navPoint>
      <navPoint><navLabel><text>Chapter II</text></navLabel><content src="b.html"/></navPoint></navMap></ncx>`),
    'title.html': xhtml('<p>OLD BOOK</p><p>by Someone</p>'),
    'a.html': xhtml('<h2>Chapter I</h2><p>It begins.</p><p id="sec">A section starts here.</p>'),
    'b.html': xhtml('<h2>Chapter II</h2><p>It ends.</p>'),
  });
  const a = analyzeDocument(parseBytes('epub', zip));

  it('reads the NCX and the guide', () => {
    expect(a.toc.map((e) => [e.title, e.level, textOf(a.blocks, e.block)])).toEqual([
      ['Title Page', 1, 'OLD BOOK'],
      ['Chapter I', 1, 'Chapter I'],
      ['A section', 2, 'A section starts here.'],
      ['Chapter II', 1, 'Chapter II'],
    ]);
    expect(textOf(a.blocks, a.content.start)).toBe('Chapter I');
  });
});

describe('Word documents with a built-in table of contents', () => {
  const para = (inner: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
  const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const body = [
    para(run('My Report'), 'Title'),
    para(run('Copyright 2025 Example Corp. All rights reserved.')),
    `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent>
      ${para(run('Contents'), 'TOCHeading')}
      ${para(`<w:hyperlink w:anchor="_Toc1">${run('Introduction')}${run('\t2')}</w:hyperlink>`, 'TOC1')}
      ${para(`<w:hyperlink w:anchor="_Toc2">${run('Results')}${run('\t5')}</w:hyperlink>`, 'TOC1')}
      ${para(`<w:hyperlink w:anchor="_Toc3">${run('Details')}${run('\t6')}</w:hyperlink>`, 'TOC2')}
    </w:sdtContent></w:sdt>`,
    para(`<w:bookmarkStart w:id="1" w:name="_Toc1"/>${run('Introduction')}<w:bookmarkEnd w:id="1"/>`, 'Heading1'),
    para(run('We measured things carefully over several weeks.')),
    para(`<w:bookmarkStart w:id="2" w:name="_Toc2"/>${run('Results')}`, 'Heading1'),
    para(run('The results were clear and repeatable.')),
    para(`<w:bookmarkStart w:id="3" w:name="_Toc3"/>${run('Details')}`, 'Heading2'),
    para(run('Further details follow in this section of the report.')),
  ].join('');
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const a = analyzeDocument(parseBytes('docx', zipSync({ 'word/document.xml': strToU8(xml) })));

  it('uses the TOC field for navigation and skips it when reading', () => {
    expect(a.toc.map((e) => [e.title, e.level, textOf(a.blocks, e.block)])).toEqual([
      ['Introduction', 1, 'Introduction'],
      ['Results', 1, 'Results'],
      ['Details', 2, 'Details'],
    ]);
    expect(textOf(a.blocks, a.content.start)).toBe('Introduction');
  });
});

describe('Project Gutenberg plain text', () => {
  const txt = [
    'The Project Gutenberg eBook of A Tale',
    'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost.',
    '*** START OF THE PROJECT GUTENBERG EBOOK A TALE ***',
    'A TALE',
    'by An Author',
    'CONTENTS',
    'CHAPTER I. The Start\nCHAPTER II. The End',
    'CHAPTER I. The Start',
    'Once upon a time there was a story that needed telling, and so it was told.',
    'It went on for a while.',
    'CHAPTER II. The End',
    'And then it was over, as all stories eventually are.',
    '*** END OF THE PROJECT GUTENBERG EBOOK A TALE ***',
    'Updated editions will replace the previous one. Creating the works from print editions not protected by U.S. copyright law means that no one owns a United States copyright in these works.',
  ].join('\n\n');
  const a = analyzeDocument(parseBytes('txt', strToU8(txt)));

  it('trims the licence and the title page/contents', () => {
    expect(textOf(a.blocks, a.content.start)).toBe('CHAPTER I. The Start');
    expect(textOf(a.blocks, a.content.end)).toMatch(/^\*\*\* END OF/);
    expect(a.toc.filter((e) => !e.skipped).map((e) => e.title)).toEqual(['CHAPTER I. The Start', 'CHAPTER II. The End']);
  });
});
