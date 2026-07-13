import type { MapExplorationSave } from "./mapExploration";

const DB_NAME = "genshin-fake-exploration";
const DB_VERSION = 1;
const META = "meta";
const FINE = "fine-pages";
const SECTORS = "sector-pages";
const SNAPSHOTS = "snapshots";

type PageRecord = { id: string; world: string; key: string; mask: string };
type MetaRecord = Omit<MapExplorationSave, "fineChunks" | "discoveredSectors"> & { world: string; updatedAt: number };
type SnapshotRecord = { id: string; world: string; revision: number; savedAt: number; serialized: string };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of [META, FINE, SECTORS, SNAPSHOTS]) {
        if (database.objectStoreNames.contains(name)) continue;
        const store = database.createObjectStore(name, { keyPath: name === META ? "world" : "id" });
        if (name !== META) store.createIndex("world", "world", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open exploration IndexedDB"));
  });
}

async function recordsForWorld<T>(store: IDBObjectStore, world: string): Promise<T[]> {
  return requestResult(store.index("world").getAll(IDBKeyRange.only(world))) as Promise<T[]>;
}

async function deleteWorldPages(store: IDBObjectStore, world: string): Promise<void> {
  const keys = await requestResult(store.index("world").getAllKeys(IDBKeyRange.only(world)));
  for (const key of keys) store.delete(key);
}

function assemble(meta: MetaRecord, fine: PageRecord[], sectors: PageRecord[]): MapExplorationSave {
  const { world: _world, updatedAt: _updatedAt, ...rest } = meta;
  return {
    ...rest,
    fineChunks: Object.fromEntries(fine.map((entry) => [entry.key, entry.mask])),
    discoveredSectors: Object.fromEntries(sectors.map((entry) => [entry.key, entry.mask])),
  };
}

async function recoverLatestSnapshot(database: IDBDatabase, world: string): Promise<MapExplorationSave | null> {
  const transaction = database.transaction(SNAPSHOTS, "readonly");
  const snapshots = await recordsForWorld<SnapshotRecord>(transaction.objectStore(SNAPSHOTS), world);
  await transactionDone(transaction);
  snapshots.sort((a, b) => b.savedAt - a.savedAt);
  for (const snapshot of snapshots) {
    try {
      return JSON.parse(snapshot.serialized) as MapExplorationSave;
    } catch {
      // Try the previous revision.
    }
  }
  return null;
}

export async function loadExplorationFromIndexedDb(world: string): Promise<MapExplorationSave | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([META, FINE, SECTORS], "readonly");
    const metaPromise = requestResult(transaction.objectStore(META).get(world)) as Promise<MetaRecord | undefined>;
    const finePromise = recordsForWorld<PageRecord>(transaction.objectStore(FINE), world);
    const sectorPromise = recordsForWorld<PageRecord>(transaction.objectStore(SECTORS), world);
    const [meta, fine, sectors] = await Promise.all([metaPromise, finePromise, sectorPromise]);
    await transactionDone(transaction);
    if (!meta) return recoverLatestSnapshot(database, world);
    return assemble(meta, fine, sectors);
  } catch {
    return recoverLatestSnapshot(database, world);
  } finally {
    database.close();
  }
}

export async function saveExplorationToIndexedDb(world: string, save: MapExplorationSave): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([META, FINE, SECTORS, SNAPSHOTS], "readwrite");
    const fineStore = transaction.objectStore(FINE);
    const sectorStore = transaction.objectStore(SECTORS);
    const snapshotStore = transaction.objectStore(SNAPSHOTS);
    await Promise.all([deleteWorldPages(fineStore, world), deleteWorldPages(sectorStore, world)]);
    for (const [key, mask] of Object.entries(save.fineChunks)) fineStore.put({ id: `${world}|${key}`, world, key, mask } satisfies PageRecord);
    for (const [key, mask] of Object.entries(save.discoveredSectors)) sectorStore.put({ id: `${world}|${key}`, world, key, mask } satisfies PageRecord);
    const { fineChunks: _fine, discoveredSectors: _sectors, ...rest } = save;
    transaction.objectStore(META).put({ ...rest, world, updatedAt: Date.now() } satisfies MetaRecord);
    const snapshot: SnapshotRecord = { id: `${world}|${save.revision}|${Date.now()}`, world, revision: save.revision, savedAt: Date.now(), serialized: JSON.stringify(save) };
    snapshotStore.put(snapshot);
    const oldSnapshots = await recordsForWorld<SnapshotRecord>(snapshotStore, world);
    oldSnapshots.sort((a, b) => b.savedAt - a.savedAt);
    for (const old of oldSnapshots.slice(2)) snapshotStore.delete(old.id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function removeExplorationFromIndexedDb(world: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([META, FINE, SECTORS, SNAPSHOTS], "readwrite");
    transaction.objectStore(META).delete(world);
    await Promise.all([
      deleteWorldPages(transaction.objectStore(FINE), world),
      deleteWorldPages(transaction.objectStore(SECTORS), world),
      deleteWorldPages(transaction.objectStore(SNAPSHOTS), world),
    ]);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export function exportExploration(save: MapExplorationSave): string {
  return JSON.stringify({ format: "genshin-fake-exploration", exportedAt: new Date().toISOString(), save }, null, 2);
}

export function importExploration(serialized: string): MapExplorationSave {
  const parsed = JSON.parse(serialized) as { format?: string; save?: MapExplorationSave };
  if (parsed.format !== "genshin-fake-exploration" || parsed.save?.version !== 2) throw new Error("File exploration không hợp lệ");
  return parsed.save;
}
