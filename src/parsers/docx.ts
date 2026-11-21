import { XMLParser } from 'fast-xml-parser';
import type { Block, ParsedDocument, RawTocEntry } from '../text/blocks';
import { finalizeBlocks } from '../text/clean';
import { readText, unzip } from './zip';

type Node = Record<string, unknown> & { ':@'?: Record<string, string> };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  trimValues: false,
  processEntities: true,
});

const tagOf = (n: Node) => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: Node) => (n[tagOf(n)] as Node[]) ?? [];

function findAll(nodes: Node[], tag: string, out: Node[] = [], stopAt?: Set<string>): Node[] {
  for (const n of nodes) {
    const t = tagOf(n);
    if (t === tag) out.push(n);
    else if (!stopAt?.has(t) && Array.isArray(n[t])) findAll(n[t] as Node[], tag, out, stopAt);
  }
  return out;
}

/** Concatenate text inside a paragraph node, mapping tabs/breaks to spaces. */
function paragraphText(nodes: Node[], textTags: Set<string>, spaceTags: Set<string>, skipTags: Set<string>): string {
  let s = '';
  for (const n of nodes) {
    const t = tagOf(n);
    if (t === '#text') s += String(n['#text']);
    else if (skipTags.has(t)) continue;
    else if (spaceTags.has(t)) s += ' ';
    else if (Array.isArray(n[t])) s += paragraphText(n[t] as Node[], textTags, spaceTags, skipTags);
  }
  return s;
}

const W_SPACE = new Set(['w:tab', 'w:br', 'w:cr']);
const W_SKIP = new Set(['w:instrText', 'w:delText', 'w:pPr', 'w:rPr', 'w:fldChar']);

const attr = (n: Node | undefined, name: string) => n?.[':@']?.[name];

export function parseDocx(bytes: Uint8Array): ParsedDocument {
  const zip = unzip(bytes);
  const docXml = readText(zip, 'word/document.xml');
  if (!docXml) throw new Error('Not a valid Word document (missing word/document.xml).');
  const tree = parser.parse(docXml) as Node[];
  const body = findAll(tree, 'w:body')[0];
  const blocks: Block[] = [];
  const toc: RawTocEntry[] = [];

  const paragraph = (p: Node, inTocBlock: boolean) => {
    const pPr = kids(p).find((n) => tagOf(n) === 'w:pPr');
    const style = pPr ? attr(findAll(kids(pPr), 'w:pStyle')[0], 'w:val') ?? '' : '';
    const isList = pPr ? findAll(kids(pPr), 'w:numPr').length > 0 : false;
    const text = paragraphText(kids(p), new Set(['w:t']), W_SPACE, W_SKIP);
    // Word bookmarks (e.g. "_Toc123" on headings) are what TOC hyperlinks point at.
    const anchors = findAll(kids(p), 'w:bookmarkStart')
      .map((b) => attr(b, 'w:name'))
      .filter((n): n is string => !!n && n !== '_GoBack')
      .map((n) => `#${n}`);
    const extra = anchors.length ? { anchors } : {};

    // Built-in Word table of contents: inside a TOC content control, TOC1-9 styles, or a TOC field.
    const instr = findAll(kids(p), 'w:instrText').map((n) => paragraphText(kids(n), new Set(), new Set(), new Set())).join(' ');
    const tocStyle = /^(TOC\s?\d|TOCHeading|TableofFigures)$/i.test(style);
    if (inTocBlock || tocStyle || /^\s*TOC\s/.test(instr)) {
      const link = attr(findAll(kids(p), 'w:hyperlink')[0], 'w:anchor');
      const level = Number(/(\d)$/.exec(style)?.[1] ?? 1);
      const title = text.replace(/\s*\d+\s*$/, '').trim();
      if (title && !/^(table of )?contents$/i.test(title)) toc.push({ title, level, ...(link ? { anchor: `#${link}` } : {}) });
      blocks.push({ kind: 'paragraph', text, matter: 'toc', ...extra });
      return;
    }
    const heading = /^(?:Heading|heading)\s?(\d)$/.exec(style) ?? (/^Title$/i.test(style) ? ['', '1'] : null);
    if (heading) blocks.push({ kind: 'heading', level: Number(heading[1]), text, ...extra });
    else if (/quote/i.test(style)) blocks.push({ kind: 'quote', text, ...extra });
    else blocks.push({ kind: isList || /List/i.test(style) ? 'list' : 'paragraph', text, ...extra });
  };

  const walk = (nodes: Node[], inTocBlock: boolean) => {
    for (const n of nodes) {
      const t = tagOf(n);
      if (t === 'w:p') paragraph(n, inTocBlock);
      else if (t === 'w:sdt') {
        const pr = kids(n).find((c) => tagOf(c) === 'w:sdtPr');
        const gallery = pr ? attr(findAll(kids(pr), 'w:docPartGallery')[0], 'w:val') ?? '' : '';
        const content = kids(n).find((c) => tagOf(c) === 'w:sdtContent');
        if (content) walk(kids(content), inTocBlock || /table of contents/i.test(gallery));
      } else if (Array.isArray(n[t])) walk(n[t] as Node[], inTocBlock);
    }
  };
  if (body) walk(kids(body), false);

  const core = readText(zip, 'docProps/core.xml');
  const title = core ? /<dc:title>([^<]*)<\/dc:title>/.exec(core)?.[1] : undefined;
  const author = core ? /<dc:creator>([^<]*)<\/dc:creator>/.exec(core)?.[1] : undefined;
  return { title: title || undefined, author: author || undefined, blocks: finalizeBlocks(blocks), ...(toc.length ? { toc } : {}) };
}

const ODT_SPACE = new Set(['text:tab', 'text:line-break', 'text:s']);
const ODT_SKIP = new Set(['text:note', 'office:annotation', 'text:bookmark-ref']);

export function parseOdt(bytes: Uint8Array): ParsedDocument {
  const zip = unzip(bytes);
  const content = readText(zip, 'content.xml');
  if (!content) throw new Error('Not a valid OpenDocument text file.');
  const tree = parser.parse(content) as Node[];
  const blocks: Block[] = [];
  const walk = (nodes: Node[], inList: boolean) => {
    for (const n of nodes) {
      const t = tagOf(n);
      if (t === 'text:h') {
        blocks.push({ kind: 'heading', level: Number(n[':@']?.['text:outline-level'] ?? 1), text: paragraphText(kids(n), new Set(), ODT_SPACE, ODT_SKIP) });
      } else if (t === 'text:p') {
        blocks.push({ kind: inList ? 'list' : 'paragraph', text: paragraphText(kids(n), new Set(), ODT_SPACE, ODT_SKIP) });
      } else if (Array.isArray(n[t]) && !ODT_SKIP.has(t)) {
        walk(n[t] as Node[], inList || t === 'text:list');
      }
    }
  };
  walk(tree, false);
  return { blocks: finalizeBlocks(blocks) };
}
