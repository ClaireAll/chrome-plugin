import {
  appendCompletedRecord,
  createEmptyCompletedData,
  normalizeCompletedData
} from "./domain.ts";

const DB_NAME = "todo-extension";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const COMPLETED_HANDLE_KEY = "completed-json";
const COMPLETED_DIRECTORY_HANDLE_KEY = "completed-directory";
const COMPLETED_META_KEY = "todoCompletedFileMeta";
const DEFAULT_COMPLETED_FILE_NAME = "todo.json";
const PERMISSION_MESSAGE = "Completed JSON file permission is required";
const COMPLETED_LOCK_NAME = "todo-completed-file";

let localCompletedFileLock: Promise<any> = Promise.resolve();

type PickerOptions = {
  fileName?: string;
  pickerId?: string;
  startIn?: string;
};

type ReadOptions = {
  allowRequest?: boolean;
  includeRawText?: boolean;
};

type PermissionOptions = {
  allowRequest?: boolean;
};

export async function getCompletedFileStatus() {
  const handle = await getCompletedFileHandle();
  const directoryHandle = await getCompletedDirectoryHandle();
  const meta = await chromeStorageGet(COMPLETED_META_KEY);
  const permissionHandle = directoryHandle || handle;
  const permission = permissionHandle ? await queryFilePermission(permissionHandle, "readwrite") : "missing";
  return {
    bound: Boolean(handle),
    directoryName: directoryHandle?.name || meta[COMPLETED_META_KEY]?.directoryName || "",
    fileName: handle?.name || meta[COMPLETED_META_KEY]?.fileName || "",
    boundAt: meta[COMPLETED_META_KEY]?.boundAt || "",
    permission
  };
}

export async function pickCompletedJsonFile(options: PickerOptions = {}) {
  if (!globalThis.showOpenFilePicker) return failure("unsupported", "Local JSON files are not supported");

  try {
    const [handle] = await globalThis.showOpenFilePicker(filePickerOptions(options));
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return withCompletedFileLock(async () => {
      const result = await readCompletedDataForHandle(handle, { includeRawText: true });
      if (!result.ok) return result;
      const writeResult = await writeTextForHandle(handle, result.rawText);
      if (!writeResult.ok) return writeResult;
      const bindResult = await saveCompletedFileHandle(handle);
      if (!bindResult.ok) return bindResult;
      return { ok: true, data: result.data, directoryName: "", fileName: result.fileName, permission: "granted" };
    });
  } catch (error) {
    return failure("picker_cancelled", error?.message || "No completed JSON file was selected");
  }
}

export async function createCompletedJsonFile(options: PickerOptions = {}) {
  if (!globalThis.showSaveFilePicker) return failure("unsupported", "Local JSON files are not supported");

  try {
    const handle = await globalThis.showSaveFilePicker({
      suggestedName: options.fileName || "todo-completed.json",
      ...filePickerOptions(options)
    });
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return withCompletedFileLock(async () => {
      const data = createEmptyCompletedData();
      const result = await writeCompletedDataForHandle(handle, data);
      if (!result.ok) return result;
      const bindResult = await saveCompletedFileHandle(handle);
      if (!bindResult.ok) return bindResult;
      return { ...result, data, directoryName: "", permission: "granted" };
    });
  } catch (error) {
    return failure("picker_cancelled", error?.message || "No completed JSON file was created");
  }
}

export async function pickCompletedConfigDirectory(options: PickerOptions = {}) {
  if (!globalThis.showDirectoryPicker) return failure("unsupported", "Local config directories are not supported");

  try {
    const directoryHandle = await globalThis.showDirectoryPicker({
      ...(options.pickerId ? { id: options.pickerId } : {}),
      ...(options.startIn ? { startIn: options.startIn } : {}),
      mode: "readwrite"
    });
    const directoryPermission = await ensureFilePermission(directoryHandle, "readwrite", { allowRequest: true });
    if (!directoryPermission.ok) return directoryPermission;

    return withCompletedFileLock(async () => {
      let fileHandle;
      try {
        fileHandle = await directoryHandle.getFileHandle(options.fileName || DEFAULT_COMPLETED_FILE_NAME, { create: true });
      } catch (error) {
        return failure("file_create_error", error?.message || "Config JSON file could not be created");
      }

      const filePermission = await ensureFilePermission(fileHandle, "readwrite", { allowRequest: true });
      if (!filePermission.ok) return filePermission;
      const result = await readCompletedDataForHandle(fileHandle, { includeRawText: true, allowRequest: true });
      if (!result.ok) return result;

      if (!result.rawText.trim()) {
        const writeResult = await writeCompletedDataForHandle(fileHandle, result.data);
        if (!writeResult.ok) return writeResult;
      }

      const bindResult = await saveCompletedFileHandle(fileHandle, directoryHandle);
      if (!bindResult.ok) return bindResult;
      return {
        ok: true,
        data: result.data,
        fileName: result.fileName,
        directoryName: directoryHandle.name || "",
        permission: "granted"
      };
    });
  } catch (error) {
    return failure("picker_cancelled", error?.message || "No config directory was selected");
  }
}

export async function requestCompletedFilePermission(mode: "read" | "readwrite" = "readwrite") {
  const handle = await getCompletedFileHandle();
  if (!handle) return failure("missing_file", "No completed JSON file is bound");
  const directoryHandle = await getCompletedDirectoryHandle();
  if (directoryHandle) {
    const directoryPermission = await ensureFilePermission(directoryHandle, mode, { allowRequest: true });
    if (!directoryPermission.ok) return directoryPermission;
  }
  const permission = await ensureFilePermission(handle, mode, { allowRequest: true });
  if (!permission.ok) return permission;
  return {
    ok: true,
    directoryName: directoryHandle?.name || "",
    fileName: handle.name,
    permission: "granted"
  };
}

export async function readCompletedData() {
  return withCompletedFileLock(async () => readCompletedDataForHandle(await getCompletedFileHandle()));
}

async function readCompletedDataForHandle(handle: any, options: ReadOptions = {}): Promise<any> {
  if (!handle) return failure("missing_file", "No completed JSON file is bound");

  const permission = await ensureFilePermission(handle, "read", { allowRequest: options.allowRequest === true });
  if (!permission.ok) return permission;

  try {
    const file = await handle.getFile();
    const text = await file.text();
    return {
      ok: true,
      data: normalizeCompletedData(text.trim() ? JSON.parse(text) : createEmptyCompletedData()),
      fileName: handle.name,
      ...(options.includeRawText ? { rawText: text } : {})
    };
  } catch (error) {
    if (isPermissionError(error)) return failure("permission_denied", PERMISSION_MESSAGE);
    return failure("parse_error", "Completed JSON is invalid");
  }
}

export async function writeCompletedData(data: unknown) {
  return withCompletedFileLock(async () => writeCompletedDataForHandle(await getCompletedFileHandle(), data));
}

async function writeCompletedDataForHandle(handle: any, data: unknown): Promise<any> {
  if (!handle) return failure("missing_file", "No completed JSON file is bound");

  return writeTextForHandle(handle, `${JSON.stringify(normalizeCompletedData(data), null, 2)}\n`);
}

async function writeTextForHandle(handle: any, text: string): Promise<any> {
  if (!handle) return failure("missing_file", "No completed JSON file is bound");
  const permission = await ensureFilePermission(handle, "readwrite");
  if (!permission.ok) return permission;
  try {
    const writable = await handle.createWritable();
    await writable.write(String(text || ""));
    await writable.close();
    return { ok: true, fileName: handle.name };
  } catch (error) {
    if (isPermissionError(error)) return failure("permission_denied", PERMISSION_MESSAGE);
    return failure("write_error", "Completed JSON write failed");
  }
}

export async function appendCompletedRecordToFile(text: unknown, completedAt: unknown) {
  return mutateCompletedData((data) => appendCompletedRecord(data, text, completedAt));
}

export async function mutateCompletedData(mutator: (data: any) => any) {
  return withCompletedFileLock(async () => {
    const handle = await getCompletedFileHandle();
    const result = await readCompletedDataForHandle(handle);
    if (!result.ok) return result;
    return writeCompletedDataForHandle(handle, mutator(result.data));
  });
}

async function saveCompletedFileHandle(handle: any, directoryHandle: any = null): Promise<any> {
  try {
    const db = await openDatabase();
    const previousMeta = (await chromeStorageGet(COMPLETED_META_KEY))[COMPLETED_META_KEY];
    const previousFileHandle = await getFromStore(db, COMPLETED_HANDLE_KEY);
    const previousDirectoryHandle = await getFromStore(db, COMPLETED_DIRECTORY_HANDLE_KEY);
    const nextMeta = {
      fileName: handle?.name || "todo-completed.json",
      boundAt: new Date().toISOString(),
      ...(directoryHandle?.name ? { directoryName: directoryHandle.name } : {})
    };
    await chromeStorageSet({ [COMPLETED_META_KEY]: nextMeta });
    try {
      await putInStore(db, COMPLETED_HANDLE_KEY, handle);
      await putInStore(db, COMPLETED_DIRECTORY_HANDLE_KEY, directoryHandle);
      return { ok: true, fileName: nextMeta.fileName };
    } catch {
      await restoreCompletedFileMeta(previousMeta);
      try {
        await putInStore(db, COMPLETED_HANDLE_KEY, previousFileHandle || null);
        await putInStore(db, COMPLETED_DIRECTORY_HANDLE_KEY, previousDirectoryHandle || null);
      } catch {}
      return failure("bind_error", "Completed JSON file binding failed");
    }
  } catch {
    return failure("bind_error", "Completed JSON file binding failed");
  }
}

async function getCompletedFileHandle(): Promise<any> {
  try {
    return await getFromStore(await openDatabase(), COMPLETED_HANDLE_KEY);
  } catch {
    return null;
  }
}

async function getCompletedDirectoryHandle(): Promise<any> {
  try {
    return await getFromStore(await openDatabase(), COMPLETED_DIRECTORY_HANDLE_KEY);
  } catch {
    return null;
  }
}

function filePickerOptions(options: PickerOptions): Record<string, any> {
  return {
    ...(options.pickerId ? { id: options.pickerId } : {}),
    ...(options.startIn ? { startIn: options.startIn } : {}),
    types: [{ description: "JSON files", accept: { "application/json": [".json"] } }]
  };
}

async function ensureFilePermission(handle: any, mode: "read" | "readwrite", options: PermissionOptions = {}) {
  try {
    const permissionOptions = { mode };
    if (typeof handle.queryPermission === "function" && await handle.queryPermission(permissionOptions) === "granted") {
      return { ok: true };
    }
    if (options.allowRequest && typeof handle.requestPermission === "function" && await handle.requestPermission(permissionOptions) === "granted") {
      return { ok: true };
    }
  } catch {}
  return failure("permission_denied", PERMISSION_MESSAGE);
}

async function queryFilePermission(handle: any, mode: "read" | "readwrite") {
  try {
    return typeof handle.queryPermission === "function" ? await handle.queryPermission({ mode }) : "prompt";
  } catch {
    return "denied";
  }
}

function isPermissionError(error: any): boolean {
  return error?.name === "NotAllowedError" || /permission|activation/i.test(error?.message || "");
}

function failure(reason: string, message: string): { ok: false; reason: string; message: string } {
  return { ok: false, reason, message };
}

function chromeStorageGet(key: string): Promise<any> {
  return new Promise<any>((resolve) => {
    if (!globalThis.chrome?.storage?.local) return resolve({});
    chrome.storage.local.get(key, resolve);
  });
}

function withCompletedFileLock<T>(operation: () => Promise<T>): Promise<T> {
  if (globalThis.navigator?.locks?.request) {
    return (globalThis.navigator.locks.request as any)(COMPLETED_LOCK_NAME, operation) as Promise<T>;
  }

  const task = localCompletedFileLock.then(operation, operation) as Promise<T>;
  localCompletedFileLock = task.catch(() => {});
  return task;
}

function chromeStorageSet(value: Record<string, any>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!globalThis.chrome?.storage?.local) return resolve();
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function chromeStorageRemove(key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!globalThis.chrome?.storage?.local?.remove) return resolve();
    chrome.storage.local.remove(key, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function restoreCompletedFileMeta(previousMeta: any): Promise<void> {
  try {
    if (previousMeta) await chromeStorageSet({ [COMPLETED_META_KEY]: previousMeta });
    else await chromeStorageRemove(COMPLETED_META_KEY);
  } catch {}
}

function openDatabase(): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getFromStore(db: any, key: string): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const request = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putInStore(db: any, key: string, value: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE, "readwrite");
    const request = transaction.objectStore(HANDLE_STORE).put(value, key);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || request.error);
  });
}
