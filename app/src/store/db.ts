const NAME = 'mojal-video';
const STORES = ['projects', 'assets', 'blobs', 'kv', 'catalog', 'queue'];
let dbp: Promise<IDBDatabase> | null = null;

function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, s === 'blobs' || s === 'kv' ? undefined : { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(d => new Promise<T>((res, rej) => {
    const tx = d.transaction(store, mode);
    const rq = fn(tx.objectStore(store));
    tx.oncomplete = () => res(rq.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  }));
}

export const db = {
  get: <T>(s: string, k: string) => run<T | undefined>(s, 'readonly', x => x.get(k)),
  all: <T>(s: string) => run<T[]>(s, 'readonly', x => x.getAll()),
  put: (s: string, v: unknown, k?: string) => run<IDBValidKey>(s, 'readwrite', x => (k === undefined ? x.put(v) : x.put(v, k))),
  del: (s: string, k: string) => run<undefined>(s, 'readwrite', x => x.delete(k)),
  clear: (s: string) => run<undefined>(s, 'readwrite', x => x.clear()),
};

export const kv = {
  get: <T>(k: string) => db.get<T>('kv', k),
  set: (k: string, v: unknown) => db.put('kv', v, k),
};
