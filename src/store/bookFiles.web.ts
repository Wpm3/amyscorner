// Web preview fallback (the real apps use the file system).
const key = (id: string) => `unfold.book.${id}`;

export async function writeBookFile(id: string, json: string): Promise<void> {
  localStorage.setItem(key(id), json);
}

export async function readBookFile(id: string): Promise<string | null> {
  return localStorage.getItem(key(id));
}

export async function deleteBookFile(id: string): Promise<void> {
  localStorage.removeItem(key(id));
}
