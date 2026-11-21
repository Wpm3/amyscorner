import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { usePdfExtractor } from '../components/PdfExtractor';
import { detectFormat, parseBytes, SUPPORTED_EXTENSIONS } from '../parsers';
import { parseTxt } from '../parsers/txt';
import { addBook, type BookSummary } from '../store/library';

export interface ImportState {
  busy: boolean;
  message?: string;
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

export function useImporter() {
  const extractPdf = usePdfExtractor();
  const [state, setState] = useState<ImportState>({ busy: false });

  const importFile = useCallback(async (): Promise<BookSummary | null> => {
    const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const format = detectFormat(asset.name, asset.mimeType);
    if (!format) {
      throw new Error(`That file type isn't supported yet. Try: ${SUPPORTED_EXTENSIONS.filter((e) => e.length <= 4).join(', ')}.`);
    }
    setState({ busy: true, message: `Opening ${asset.name}…` });
    try {
      const file = new File(asset.uri);
      let doc;
      if (format === 'pdf') {
        const base64 = await file.base64();
        doc = await extractPdf(base64, (done, total) =>
          setState({ busy: true, message: total ? `Reading PDF page ${done} of ${total}…` : 'Reading PDF…' }),
        );
      } else {
        const bytes = await file.bytes();
        // Let the spinner paint before a synchronous parse of a large book.
        await new Promise((r) => setTimeout(r, 30));
        doc = parseBytes(format as Exclude<typeof format, 'pdf' | 'paste'>, bytes);
      }
      const book = await addBook(doc, format, asset.name);
      try {
        file.delete();
      } catch {
        /* cache copy; ignore */
      }
      return book;
    } finally {
      setState({ busy: false });
    }
  }, [extractPdf]);

  const importText = useCallback(async (text: string, title?: string) => {
    const doc = parseTxt(text);
    const fallback = title?.trim() || text.trim().split(/\s+/).slice(0, 6).join(' ') || 'Pasted text';
    return addBook({ ...doc, title: title?.trim() || undefined }, 'paste', fallback);
  }, []);

  return { importFile, importText, state };
}
