import { XMLParser } from 'fast-xml-parser';
import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';
import type { Block, ParsedDocument, RawTocEntry } from '../text/blocks';
import { htmlToBlocks } from './html';
import { readText, resolvePath, unzip, type ZipEntries } from './zip';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const textValue = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return textValue(v[0]);
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as { '#text': unknown })['#text']);
  return undefined;
};

interface ManifestItem {
  id: string;
  href: string;
  path: string;
  type: string;
  props: string;
}

/** "text/ch1.xhtml#sec2" relative to a nav file → "OEBPS/text/ch1.xhtml#sec2" (zip path + fragment). */
function resolveHref(base: string, href: string): string {
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    /* keep raw */
  }
  const [file, frag] = decoded.split('#');
  const path = file ? resolvePath(base, file) : base;
  return frag ? `${path}#${frag}` : path;
}

const elText = (n: ChildNode): string =>
  n.type === 'text' ? n.data : n.type === 'tag' ? (n as Element).children.map(elText).join('') : '';
const tag = (n: ChildNode, name: string) => n.type === 'tag' && (n as Element).name.replace(/^.*:/, '') === name;
const childTags = (el: Element, name: string) => el.children.filter((c) => tag(c, name)) as Element[];

function findNav(nodes: ChildNode[], type: RegExp): Element | undefined {
  for (const n of nodes) {
    if (n.type !== 'tag') continue;
    const el = n as Element;
    if (tag(el, 'nav') && type.test(`${el.attribs['epub:type'] ?? ''} ${el.attribs.role ?? ''}`)) return el;
    const found = findNav(el.children, type);
    if (found) return found;
  }
  return undefined;
}

/** EPUB 3 navigation document: TOC (nested <ol>) and landmarks. */
function parseNavDoc(html: string, navPath: string): { toc: RawTocEntry[]; bodyStart?: string } {
  const doc = parseDocument(html, { xmlMode: false, lowerCaseTags: true });
  const toc: RawTocEntry[] = [];
  const tocNav = findNav(doc.children, /\b(toc|doc-toc)\b/);
  const walkOl = (ol: Element, level: number) => {
    for (const li of childTags(ol, 'li')) {
      const a = li.children.find((c) => tag(c, 'a') || tag(c, 'span')) as Element | undefined;
      if (a) {
        const href = a.attribs?.href;
        toc.push({ title: elText(a).replace(/\s+/g, ' ').trim(), level, ...(href ? { anchor: resolveHref(navPath, href) } : {}) });
      }
      for (const sub of childTags(li, 'ol')) walkOl(sub, level + 1);
    }
  };
  if (tocNav) for (const ol of childTags(tocNav, 'ol')) walkOl(ol, 1);

  let bodyStart: string | undefined;
  const landmarks = findNav(doc.children, /\blandmarks\b/);
  if (landmarks) {
    const stack: ChildNode[] = [...landmarks.children];
    while (stack.length) {
      const n = stack.shift()!;
      if (n.type !== 'tag') continue;
      const el = n as Element;
      if (tag(el, 'a') && /\b(bodymatter|text|start)\b/.test(el.attribs['epub:type'] ?? '') && el.attribs.href) {
        bodyStart = resolveHref(navPath, el.attribs.href);
        break;
      }
      stack.push(...el.children);
    }
  }
  return { toc, bodyStart };
}

/** EPUB 2 NCX table of contents. */
function parseNcx(text: string, ncxPath: string): RawTocEntry[] {
  const doc = xml.parse(text);
  const out: RawTocEntry[] = [];
  const walk = (points: unknown, level: number) => {
    for (const p of asArray(points as Record<string, unknown>[])) {
      const label = textValue((p.navLabel as Record<string, unknown> | undefined)?.text);
      const src = (p.content as Record<string, string> | undefined)?.['@src'];
      if (label) out.push({ title: label.replace(/\s+/g, ' ').trim(), level, ...(src ? { anchor: resolveHref(ncxPath, src) } : {}) });
      walk(p.navPoint, level + 1);
    }
  };
  walk(doc?.ncx?.navMap?.navPoint, 1);
  return out;
}

export function parseEpub(bytes: Uint8Array): ParsedDocument {
  const zip: ZipEntries = unzip(bytes);
  const container = readText(zip, 'META-INF/container.xml');
  if (!container) throw new Error('Not a valid EPUB (missing container.xml).');
  const rootfiles = asArray(xml.parse(container)?.container?.rootfiles?.rootfile);
  const opfPath: string | undefined = rootfiles[0]?.['@full-path'];
  if (!opfPath) throw new Error('EPUB has no package document.');
  const opfText = readText(zip, opfPath);
  if (!opfText) throw new Error('EPUB package document is missing.');
  const pkg = xml.parse(opfText)?.package;

  const metadata = pkg?.metadata ?? {};
  const title = textValue(metadata.title);
  const author = textValue(metadata.creator);

  const manifest = new Map<string, ManifestItem>();
  for (const item of asArray(pkg?.manifest?.item)) {
    const href = item['@href'] ?? '';
    manifest.set(item['@id'], { id: item['@id'], href, path: resolveHref(opfPath, href), type: item['@media-type'] ?? '', props: item['@properties'] ?? '' });
  }
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
  const spine = asArray(pkg?.spine?.itemref)
    .filter((ref) => ref['@linear'] !== 'no')
    .map((ref) => manifest.get(ref['@idref']))
    .filter((m): m is ManifestItem => !!m && m !== navItem);

  // Text, with an anchor for each file and each element id so the TOC can point into it.
  const blocks: Block[] = [];
  let carry: string[] = [];
  for (const item of spine) {
    if (!/x?html|xml/.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;
    const html = readText(zip, item.path);
    if (!html) continue;
    const part = htmlToBlocks(html, { anchorPrefix: item.path }).blocks;
    carry.push(item.path);
    if (!part.length) continue;
    part[0].anchors = [...carry, ...(part[0].anchors ?? [])];
    carry = [];
    blocks.push(...part);
  }
  if (!blocks.length) throw new Error('No readable text found in this EPUB.');

  // Built-in table of contents: EPUB 3 nav, else EPUB 2 NCX.
  let toc: RawTocEntry[] = [];
  let bodyStartAnchor: string | undefined;
  if (navItem) {
    const navHtml = readText(zip, navItem.path);
    if (navHtml) ({ toc, bodyStart: bodyStartAnchor } = parseNavDoc(navHtml, navItem.path));
  }
  if (!toc.length) {
    const ncxId = pkg?.spine?.['@toc'];
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
    const ncxText = ncx ? readText(zip, ncx.path) : undefined;
    if (ncx && ncxText) toc = parseNcx(ncxText, ncx.path);
  }
  // EPUB 2 <guide>: where the main text starts.
  if (!bodyStartAnchor) {
    const ref = asArray(pkg?.guide?.reference).find((r) => /^(text|start|bodymatter)$/i.test(r['@type'] ?? ''));
    if (ref?.['@href']) bodyStartAnchor = resolveHref(opfPath, ref['@href']);
  }

  return { title, author, blocks, toc, bodyStartAnchor };
}
