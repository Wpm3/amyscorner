import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { usePdfExtractor } from '../components/PdfExtractor';
import { detectFormat, parseBytes, SUPPORTED_EXTENSIONS } from '../parsers';
import { parseTxt } from '../parsers/txt';
import { addBook, type BookSummary } from '../store/library';
import type { ParsedDocument } from '../text/blocks';
import { cleanupAsset, readAssetBase64, readAssetBytes } from './readAsset';

export interface ImportState {
  busy: boolean;
  message?: string;
}

/** Something that can be imported: a name/mime plus lazy readers for its contents. */
export interface ImportSource {
  name: string;
  mimeType?: string | null;
  bytes: () => Promise<Uint8Array>;
  base64: () => Promise<string>;
  cleanup?: () => void;
}

const PICKER_TYPES = [
  'application/pdf',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/*',
  'application/xhtml+xml',
  // Many Android file providers report unusual mimes (e.g. octet-stream for .md/.fb2).
  '*/*',
];

const unsupported = () =>
  new Error(`That file type isn't supported yet. Try: ${SUPPORTED_EXTENSIONS.filter((e) => e.length <= 4).join(', ')}.`);

export function useImporter() {
  const extractPdf = usePdfExtractor();
  const [state, setState] = useState<ImportState>({ busy: false });

  const importSource = useCallback(
    async (src: ImportSource): Promise<BookSummary> => {
      const format = detectFormat(src.name, src.mimeType);
      if (!format || format === 'paste') throw unsupported();
      setState({ busy: true, message: `Opening ${src.name}…` });
      try {
        let doc: ParsedDocument;
        if (format === 'pdf') {
          doc = await extractPdf(await src.base64(), (done, total) =>
            setState({ busy: true, message: total ? `Reading PDF page ${done} of ${total}…` : 'Reading PDF…' }),
          );
        } else {
          const bytes = await src.bytes();
          // Let the spinner paint before a synchronous parse of a large book.
          await new Promise((r) => setTimeout(r, 30));
          doc = parseBytes(format, bytes);
        }
        return await addBook(doc, format, src.name);
      } finally {
        src.cleanup?.();
        setState({ busy: false });
      }
    },
    [extractPdf],
  );

  const importFile = useCallback(async (): Promise<BookSummary | null> => {
    const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return importSource({
      name: asset.name,
      mimeType: asset.mimeType,
      bytes: () => readAssetBytes(asset),
      base64: () => readAssetBase64(asset),
      cleanup: () => cleanupAsset(asset),
    });
  }, [importSource]);

  const importText = useCallback(async (text: string, title?: string) => {
    const doc = parseTxt(text);
    const fallback = title?.trim() || text.trim().split(/\s+/).slice(0, 6).join(' ') || 'Pasted text';
    return addBook({ ...doc, title: title?.trim() || undefined }, 'paste', fallback);
  }, []);

  return { importFile, importSource, importText, state };
}
