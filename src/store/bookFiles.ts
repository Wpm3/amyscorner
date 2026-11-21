import { Directory, File, Paths } from 'expo-file-system';

/** Parsed books are stored as one JSON file each in the app's document directory. */
function booksDir(): Directory {
  const dir = new Directory(Paths.document, 'books');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const fileFor = (id: string) => new File(booksDir(), `${id}.json`);

export async function writeBookFile(id: string, json: string): Promise<void> {
  const file = fileFor(id);
  if (!file.exists) file.create();
  await file.write(json);
}

export async function readBookFile(id: string): Promise<string | null> {
  const file = fileFor(id);
  return file.exists ? file.text() : null;
}

export async function deleteBookFile(id: string): Promise<void> {
  const file = fileFor(id);
  if (file.exists) file.delete();
}
