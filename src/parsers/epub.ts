import { XMLParser } from 'fast-xml-parser';
import type { Block, ParsedDocument } from '../text/blocks';
import { htmlToBlocks } from './html';
import { readText, resolvePath, unzip } from './zip';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const textValue = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return textValue(v[0]);
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as { '#text': unknown })['#text']);
  return undefined;
};

export function parseEpub(bytes: Uint8Array): ParsedDocument {
  const zip = unzip(bytes);
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

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const item of asArray(pkg?.manifest?.item)) {
    manifest.set(item['@id'], { href: item['@href'], type: item['@media-type'] ?? '', props: item['@properties'] ?? '' });
  }
  const spine = asArray(pkg?.spine?.itemref)
    .filter((ref) => ref['@linear'] !== 'no')
    .map((ref) => manifest.get(ref['@idref']))
    .filter((m): m is { href: string; type: string; props: string } => !!m && !m.props.includes('nav'));

  const blocks: Block[] = [];
  for (const item of spine) {
    if (!/x?html|xml/.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;
    const html = readText(zip, resolvePath(opfPath, item.href));
    if (!html) continue;
    blocks.push(...htmlToBlocks(html).blocks);
  }
  if (!blocks.length) throw new Error('No readable text found in this EPUB.');
  return { title, author, blocks };
}
