// Web preview fallback for the SQLite-backed key-value store.
const kv = {
  async getItemAsync(k: string) {
    return localStorage.getItem(k);
  },
  async setItemAsync(k: string, v: string) {
    localStorage.setItem(k, v);
  },
  async removeItemAsync(k: string) {
    localStorage.removeItem(k);
    return true;
  },
};
export default kv;
