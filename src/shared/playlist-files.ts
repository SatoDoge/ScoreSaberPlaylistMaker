const DB_NAME = "scoresaber-playlist-files";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const HANDLE_STORE = "handles";
const CUSTOM_IMAGE_KEY = "custom";
const DIRECTORY_KEY = "playlistDirectory";

let databasePromise: Promise<IDBDatabase> | null = null;

export async function readCustomPlaylistImage(): Promise<Blob | undefined> {
  const stored = await readStoredValue(IMAGE_STORE, CUSTOM_IMAGE_KEY);
  return stored instanceof Blob ? stored : undefined;
}

export async function writeCustomPlaylistImage(blob: Blob): Promise<void> {
  await writeStoredValue(IMAGE_STORE, CUSTOM_IMAGE_KEY, blob);
}

export async function readPlaylistDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  const stored = await readStoredValue(HANDLE_STORE, DIRECTORY_KEY);
  return stored instanceof FileSystemDirectoryHandle ? stored : undefined;
}

export async function writePlaylistDirectory(handle: FileSystemDirectoryHandle): Promise<void> {
  await writeStoredValue(HANDLE_STORE, DIRECTORY_KEY, handle);
  try {
    await navigator.storage.persist();
  } catch {
    // The handle remains in IndexedDB even if persistent storage is declined.
  }
}

export async function savePlaylistToDirectory(fileName: string, contents: string): Promise<string> {
  const directory = await readPlaylistDirectory();
  if (!directory) {
    throw new Error("保存先フォルダが設定されていません");
  }
  await ensureDirectoryPermission(directory);
  let writable: FileSystemWritableFileStream | undefined;
  try {
    const file = await directory.getFileHandle(fileName, { create: true });
    writable = await file.createWritable();
    await writable.write(contents);
    await writable.close();
    writable = undefined;
  } catch (error) {
    await writable?.abort().catch(() => undefined);
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error("保存先フォルダが見つかりません。設定からフォルダを選び直してください");
    }
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
      throw new Error("フォルダへの書き込みが許可されていません。設定からフォルダを選び直してください");
    }
    throw new Error("プレイリストをフォルダに保存できません");
  }
  return directory.name;
}

async function ensureDirectoryPermission(directory: FileSystemDirectoryHandle): Promise<void> {
  const descriptor = { mode: "readwrite" as const };
  if ((await directory.queryPermission(descriptor)) === "granted") {
    return;
  }
  if ((await directory.requestPermission(descriptor)) === "granted") {
    return;
  }
  throw new Error("フォルダへの書き込みが許可されていません。設定からフォルダを選び直してください");
}

function openFilesDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE);
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("設定を保存できません"));
    };
  });
  return databasePromise;
}

async function readStoredValue(storeName: string, key: string): Promise<unknown> {
  const db = await openFilesDatabase();
  return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

async function writeStoredValue(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openFilesDatabase();
  await requestResult(db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key));
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("設定を保存できません"));
  });
}
