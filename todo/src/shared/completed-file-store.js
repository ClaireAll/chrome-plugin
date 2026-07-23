import {
  appendCompletedRecord,
  createEmptyCompletedData,
  normalizeCompletedData
} from "./domain.js";

const DB_NAME = "todo-extension";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const COMPLETED_HANDLE_KEY = "completed-json";
const COMPLETED_META_KEY = "todoCompletedFileMeta";
const PERMISSION_MESSAGE = "Completed JSON file permission is required";
const COMPLETED_LOCK_NAME = "todo-completed-file";

let localCompletedFileLock = Promise.resolve();

export async function getCompletedFileStatus() {
  const handle = await getCompletedFileHandle();
  const meta = await chromeStorageGet(COMPLETED_META_KEY);
  const permission = handle ? await queryFilePermission(handle, "readwrite") : "missing";
  return {
    bound: Boolean(handle),
    fileName: handle?.name || meta[COMPLETED_META_KEY]?.fileName || "",
    boundAt: meta[COMPLETED_META_KEY]?.boundAt || "",
    permission
  };
}

export async function pickCompletedJsonFile(options = {}) {
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
      return { ok: true, data: result.data, fileName: result.fileName, permission: "granted" };
    });
  } catch (error) {
    return failure("picker_cancelled", error?.message || "No completed JSON file was selected");
  }
}

export async function createCompletedJsonFile(options = {}) {
  if (!globalThis.showSaveFilePicker) return failure("unsupported", "Local JSON files are not supported");

  try {
    const handle = await globalThis.showSaveFilePicker({
      suggestedName: options.fileName || "todo-completed.json",
      ...filePickerOptions(options)
    });
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return withCompletedFileLock(async () => {
      const result = await writeCompletedDataForHandle(handle, createEmptyCompletedData());
      if (!result.ok) return result;
      const bindResult = await saveCompletedFileHandle(handle);
      if (!bindResult.ok) return bindResult;
      return { ...result, permission: "granted" };
    });
  } catch (error) {
    return failure("picker_cancelled", error?.message || "No completed JSON file was created");
  }
}

export async function requestCompletedFilePermission(mode = "readwrite") {
  const handle = await getCompletedFileHandle();
  if (!handle) return failure("missing_file", "No completed JSON file is bound");
  const permission = await ensureFilePermission(handle, mode, { allowRequest: true });
  if (!permission.ok) return permission;
  return { ok: true, fileName: handle.name, permission: "granted" };
}

export async function readCompletedData() {
  return withCompletedFileLock(async () => readCompletedDataForHandle(await getCompletedFileHandle()));
}

async function readCompletedDataForHandle(handle, options = {}) {
  if (!handle) return failure("missing_file", "No completed JSON file is bound");

  const permission = await ensureFilePermission(handle, "read");
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

export async function writeCompletedData(data) {
  return withCompletedFileLock(async () => writeCompletedDataForHandle(await getCompletedFileHandle(), data));
}

async function writeCompletedDataForHandle(handle, data) {
  if (!handle) return failure("missing_file", "No completed JSON file is bound");

  return writeTextForHandle(handle, `${JSON.stringify(normalizeCompletedData(data), null, 2)}\n`);
}

async function writeTextForHandle(handle, text) {
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

export async function appendCompletedRecordToFile(text, completedAt) {
  return mutateCompletedData((data) => appendCompletedRecord(data, text, completedAt));
}

export async function mutateCompletedData(mutator) {
  return withCompletedFileLock(async () => {
    const handle = await getCompletedFileHandle();
    const result = await readCompletedDataForHandle(handle);
    if (!result.ok) return result;
    return writeCompletedDataForHandle(handle, mutator(result.data));
  });
}

async function saveCompletedFileHandle(handle) {
  try {
    const db = await openDatabase();
    const previousMeta = (await chromeStorageGet(COMPLETED_META_KEY))[COMPLETED_META_KEY];
    const nextMeta = {
      fileName: handle?.name || "todo-completed.json",
      boundAt: new Date().toISOString()
    };
    await chromeStorageSet({ [COMPLETED_META_KEY]: nextMeta });
    try {
      await putInStore(db, COMPLETED_HANDLE_KEY, handle);
      return { ok: true, fileName: nextMeta.fileName };
    } catch {
      await restoreCompletedFileMeta(previousMeta);
      return failure("bind_error", "Completed JSON file binding failed");
    }
  } catch {
    return failure("bind_error", "Completed JSON file binding failed");
  }
}

async function getCompletedFileHandle() {
  try {
    return await getFromStore(await openDatabase(), COMPLETED_HANDLE_KEY);
  } catch {
    return null;
  }
}

function filePickerOptions(options) {
  return {
    ...(options.pickerId ? { id: options.pickerId } : {}),
    ...(options.startIn ? { startIn: options.startIn } : {}),
    types: [{ description: "JSON files", accept: { "application/json": [".json"] } }]
  };
}

async function ensureFilePermission(handle, mode, options = {}) {
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

async function queryFilePermission(handle, mode) {
  try {
    return typeof handle.queryPermission === "function" ? await handle.queryPermission({ mode }) : "prompt";
  } catch {
    return "denied";
  }
}

function isPermissionError(error) {
  return error?.name === "NotAllowedError" || /permission|activation/i.test(error?.message || "");
}

function failure(reason, message) {
  return { ok: false, reason, message };
}

function chromeStorageGet(key) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) return resolve({});
    chrome.storage.local.get(key, resolve);
  });
}

function withCompletedFileLock(operation) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request(COMPLETED_LOCK_NAME, operation);
  }

  const task = localCompletedFileLock.then(operation, operation);
  localCompletedFileLock = task.catch(() => {});
  return task;
}

function chromeStorageSet(value) {
  return new Promise((resolve, reject) => {
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

function chromeStorageRemove(key) {
  return new Promise((resolve, reject) => {
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

async function restoreCompletedFileMeta(previousMeta) {
  try {
    if (previousMeta) await chromeStorageSet({ [COMPLETED_META_KEY]: previousMeta });
    else await chromeStorageRemove(COMPLETED_META_KEY);
  } catch {}
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getFromStore(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putInStore(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE, "readwrite");
    const request = transaction.objectStore(HANDLE_STORE).put(value, key);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || request.error);
  });
}
