// Everything is stored on this device with IndexedDB. Nothing is uploaded.
const DB_NAME = 'art-studio';
const DB_VERSION = 1;

let dbPromise = null;
let useMemory = false;
const memory = { pieces: new Map(), kv: new Map() }; // fallback if IndexedDB is unavailable

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!('indexedDB' in window)) { useMemory = true; resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pieces')) db.createObjectStore('pieces', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMemory = true; resolve(null); };
  });
  return dbPromise;
}

// action(store) returns an IDBRequest; action(null) returns a plain value (memory mode).
async function run(storeName, mode, action) {
  const db = await open();
  if (useMemory || !db) return action(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function isTemporary() { return useMemory; }

export async function addPiece(piece) {
  await run('pieces', 'readwrite', (s) => (s ? s.put(piece) : memory.pieces.set(piece.id, piece)));
  return piece;
}

export function getPiece(id) {
  return run('pieces', 'readonly', (s) => (s ? s.get(id) : memory.pieces.get(id)));
}

export async function allPieces() {
  const list = (await run('pieces', 'readonly', (s) => (s ? s.getAll() : [...memory.pieces.values()]))) || [];
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function deletePiece(id) {
  return run('pieces', 'readwrite', (s) => (s ? s.delete(id) : memory.pieces.delete(id)));
}

export async function kvGet(key, fallback) {
  const value = await run('kv', 'readonly', (s) => (s ? s.get(key) : memory.kv.get(key)));
  return value === undefined ? fallback : value;
}

export function kvSet(key, value) {
  return run('kv', 'readwrite', (s) => (s ? s.put(value, key) : memory.kv.set(key, value)));
}

export async function clearAll() {
  await run('pieces', 'readwrite', (s) => (s ? s.clear() : memory.pieces.clear()));
  await run('kv', 'readwrite', (s) => (s ? s.clear() : memory.kv.clear()));
}

export async function askToKeepData() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* not supported */ }
}
