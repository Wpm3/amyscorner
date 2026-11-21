import type { Block, Book, BookFormat, ParsedDocument } from '../text/blocks';
import { analyzeDocument, STRUCTURE_VERSION } from '../text/structure';
import { deleteBookFile, readBookFile, writeBookFile } from './bookFiles';
import { getJson, getJsonArray, removeKey, setJson } from './storage';

export interface BookSummary {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  addedAt: number;
  lastOpenedAt?: number;
  blockCount: number;
  contentStart?: number;
  contentEnd?: number;
}

export interface ReadingPosition {
  block: number;
  /** Number of sentences revealed in the current block. */
  revealed: number;
  updatedAt: number;
}

const INDEX_KEY = 'library.index.v1';
const posKey = (id: string) => `position.${id}`;

export async function listBooks(): Promise<BookSummary[]> {
  const books = await getJsonArray<BookSummary>(INDEX_KEY);
  return books.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
}

export async function addBook(doc: ParsedDocument, format: BookFormat, fallbackTitle: string): Promise<BookSummary> {
  if (!doc.blocks.length) throw new Error('No readable text was found in this document.');
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const title = (doc.title?.trim() || fallbackTitle.replace(/\.[a-z0-9]+$/i, '')).slice(0, 200);
  const { blocks, toc, content } = analyzeDocument(doc);
  const book: Book = { id, title, author: doc.author, format, addedAt: Date.now(), blocks, toc, content, structureVersion: STRUCTURE_VERSION };
  await writeBookFile(id, JSON.stringify(book));
  const summary: BookSummary = { id, title, author: doc.author, format, addedAt: book.addedAt, blockCount: blocks.length, contentStart: content.start, contentEnd: content.end };
  const index = await getJsonArray<BookSummary>(INDEX_KEY);
  await setJson(INDEX_KEY, [summary, ...index]);
  return summary;
}

export async function loadBook(id: string): Promise<Book | null> {
  const raw = await readBookFile(id);
  if (!raw) return null;
  let book = JSON.parse(raw) as Book;
  if ((book.structureVersion ?? 0) < STRUCTURE_VERSION || !book.toc || !book.content) {
    // Imported before structure detection existed: analyse it now and save.
    const analyzed = analyzeDocument({ blocks: book.blocks });
    book = { ...book, ...analyzed, structureVersion: STRUCTURE_VERSION };
    await writeBookFile(id, JSON.stringify(book));
  }
  const index = await getJsonArray<BookSummary>(INDEX_KEY);
  await setJson(
    INDEX_KEY,
    index.map((b) =>
      b.id === id
        ? { ...b, lastOpenedAt: Date.now(), blockCount: book.blocks.length, contentStart: book.content.start, contentEnd: book.content.end }
        : b,
    ),
  );
  return book;
}

export async function deleteBook(id: string): Promise<void> {
  await deleteBookFile(id);
  const index = await getJsonArray<BookSummary>(INDEX_KEY);
  await setJson(INDEX_KEY, index.filter((b) => b.id !== id));
  await removeKey(posKey(id));
}

export async function getPosition(id: string): Promise<ReadingPosition> {
  return getJson<ReadingPosition>(posKey(id), { block: 0, revealed: 0, updatedAt: 0 });
}

export async function savePosition(id: string, pos: Omit<ReadingPosition, 'updatedAt'>): Promise<void> {
  await setJson(posKey(id), { ...pos, updatedAt: Date.now() });
}

export async function getAllPositions(): Promise<Record<string, ReadingPosition>> {
  const books = await listBooks();
  const entries = await Promise.all(books.map(async (b) => [b.id, await getPosition(b.id)] as const));
  return Object.fromEntries(entries);
}

export type { Block };
