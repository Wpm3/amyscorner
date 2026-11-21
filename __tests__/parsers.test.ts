import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'fs';
import { join } from 'path';
import { detectFormat, parseBytes } from '../src/parsers';
import { htmlToBlocks } from '../src/parsers/html';
import { parseMarkdown } from '../src/parsers/markdown';
import { pdfPagesToBlocks } from '../src/parsers/pdf/layout';
import type { PdfPage } from '../src/parsers/pdf/types';
import { rtfToText } from '../src/parsers/rtf';
import { parseTxt } from '../src/parsers/txt';

const texts = (blocks: { text: string }[]) => blocks.map((b) => b.text);

describe('txt', () => {
  it('splits on blank lines and rejoins hard-wrapped lines', () => {
    const doc = parseTxt('First line of a para-\ngraph that wraps.\nStill going.\n\n\nSecond paragraph.\r\n');
    expect(texts(doc.blocks)).toEqual(['First line of a paragraph that wraps. Still going.', 'Second paragraph.']);
  });
  it('falls back to one paragraph per line when there are no blank lines', () => {
    expect(texts(parseTxt('One.\nTwo.\nThree.').blocks)).toEqual(['One.', 'Two.', 'Three.']);
  });
});

describe('markdown', () => {
  it('handles headings, lists, quotes, emphasis and links', () => {
    const doc = parseMarkdown('# Title\n\nSome **bold** and *italic* with a [link](http://x).\nWrapped.\n\n- item one\n- item two\n\n> quoted\n> text\n\n```\ncode\n```');
    expect(doc.title).toBe('Title');
    expect(doc.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'Some bold and italic with a link. Wrapped.' },
      { kind: 'list', text: 'item one' },
      { kind: 'list', text: 'item two' },
      { kind: 'quote', text: 'quoted text' },
      { kind: 'code', text: 'code' },
    ]);
  });
});

describe('html', () => {
  it('extracts block elements and skips scripts, nav and footnote markers', () => {
    const doc = htmlToBlocks(`<html><head><title>T</title><style>p{}</style></head><body>
      <nav epub:type="toc"><a>Contents</a></nav>
      <h2>Chapter <em>One</em></h2>
      <p>Hello <b>world</b>.<sup><a href="#n1">1</a></sup> More&nbsp;text.</p>
      <div>Loose text <p>nested para</p> trailing</div>
      <ul><li>a list item</li></ul><blockquote><p>A quote.</p></blockquote>
      <script>alert(1)</script></body></html>`);
    expect(doc.title).toBe('T');
    expect(doc.blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Chapter One' },
      { kind: 'paragraph', text: 'Hello world. More text.' },
      { kind: 'paragraph', text: 'Loose text' },
      { kind: 'paragraph', text: 'nested para' },
      { kind: 'paragraph', text: 'trailing' },
      { kind: 'list', text: 'a list item' },
      { kind: 'quote', text: 'A quote.' },
    ]);
  });
});

describe('epub', () => {
  it('reads chapters in spine order with metadata', () => {
    const zip = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
      'OEBPS/content.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>My Book</dc:title><dc:creator>Jane Doe</dc:creator></metadata>
        <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`),
      'OEBPS/nav.xhtml': strToU8('<html><body><nav><p>TOC</p></nav></body></html>'),
      'OEBPS/text/ch1.xhtml': strToU8('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>One</h1><p>First chapter text.</p></body></html>'),
      'OEBPS/text/ch2.xhtml': strToU8('<html><body><h1>Two</h1><p>Second chapter text.</p></body></html>'),
    });
    const doc = parseBytes('epub', zip);
    expect(doc.title).toBe('My Book');
    expect(doc.author).toBe('Jane Doe');
    expect(texts(doc.blocks)).toEqual(['One', 'First chapter text.', 'Two', 'Second chapter text.']);
  });
});

describe('docx', () => {
  it('reads paragraphs, headings and runs', () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Intro</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:tab/><w:t>world &amp; more.</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>A list item</w:t></w:r></w:p>
      <w:p></w:p></w:body></w:document>`;
    const doc = parseBytes('docx', zipSync({ 'word/document.xml': strToU8(xml) }));
    expect(doc.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Intro' },
      { kind: 'paragraph', text: 'Hello bold world & more.' },
      { kind: 'list', text: 'A list item' },
    ]);
  });
});

describe('odt', () => {
  it('reads headings and paragraphs', () => {
    const xml = `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>
      <text:h text:outline-level="2">Part A</text:h><text:p>Some <text:span>styled</text:span> text.</text:p></office:text></office:body></office:document-content>`;
    const doc = parseBytes('odt', zipSync({ 'content.xml': strToU8(xml) }));
    expect(doc.blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Part A' },
      { kind: 'paragraph', text: 'Some styled text.' },
    ]);
  });
});

describe('rtf', () => {
  it('strips control words and keeps paragraphs', () => {
    const rtf = "{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}{\\*\\generator x;}\\f0 Hello \\b world\\b0.\\par Caf\\'e9 \\u8212? done.\\par}";
    expect(rtfToText(rtf)).toBe('Hello world.\n\nCafé — done.\n\n');
  });
});

describe('detectFormat', () => {
  it('uses extension first, then mime', () => {
    expect(detectFormat('Book.EPUB')).toBe('epub');
    expect(detectFormat('notes.markdown')).toBe('md');
    expect(detectFormat('download', 'application/pdf')).toBe('pdf');
    expect(detectFormat('x.zip', 'application/zip')).toBeNull();
  });
});

describe('pdf layout', () => {
  const pages: PdfPage[] = JSON.parse(readFileSync(join(__dirname, 'fixtures/sample-pdf-pages.json'), 'utf8'));
  const doc = pdfPagesToBlocks(pages);

  it('detects headings and paragraphs, drops running footers and page numbers', () => {
    const all = texts(doc.blocks).join('\n');
    expect(all).not.toMatch(/The Sample Book/);
    expect(doc.blocks[0]).toEqual({ kind: 'heading', level: expect.any(Number), text: 'Chapter One' });
    expect(doc.blocks.filter((b) => b.kind === 'heading').map((b) => b.text)).toEqual(['Chapter One', 'Chapter 2', 'Chapter 3', 'Chapter 4']);
    // 3 body paragraphs per chapter + the final one.
    expect(doc.blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(10);
  });

  it('reassembles wrapped lines into whole paragraphs', () => {
    expect(doc.blocks[1].text).toBe(
      'Mr. Smith went to Washington on a cold morning. He arrived at 3 p.m. on Friday, and the streets were already dark. Although it rained all day, he walked to the old harbor anyway.',
    );
    expect(doc.blocks[doc.blocks.length - 1].text).toBe('The end of the sample. Thanks for reading.');
  });

  it('de-hyphenates words split across lines', () => {
    const lines = pdfPagesToBlocks([
      { width: 600, height: 800, items: [
        { str: 'This is an exam-', x: 72, y: 100, w: 400, h: 12 },
        { str: 'ple of hyphenation.', x: 72, y: 114, w: 120, h: 12 },
      ] },
    ]);
    expect(texts(lines.blocks)).toEqual(['This is an example of hyphenation.']);
  });
});
