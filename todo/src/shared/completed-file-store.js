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
    await saveCompletedFileHandle(handle);
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return await readCompletedData();
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
    await saveCompletedFileHandle(handle);
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return await writeCompletedData(createEmptyCompletedData());
  } catch (error) {
    return failure("picker_cancelled", error?.message || "No completed JSON file was created");
  }
}

export async function requestCompletedFilePermission(mode = "readwrite") {
  const handle = await getCompletedFileHandle();
  if (!handle) return failure("missing_file", "No completed JSON file is bound");
  return ensureFilePermission(handle, mode, { allowRequest: true });
}

export async function readCompletedData() {
  const handle = await getCompletedFileHandle();
  if (!handle) return failure("missing_file", "No completed JSON file is bound");

  const permission = await ensureFilePermission(handle, "read");
  if (!permission.ok) return permission;

  try {
    const file = await handle.getFile();
    const text = await file.text();
    return {
      ok: true,
      data: normalizeCompletedData(text.trim() ? JSON.parse(text) : createEmptyCompletedData()),
      fileName: handle.name
    };
  } catch (error) {
    if (isPermissionError(error)) return failure("permission_denied", PERMISSION_MESSAGE);
    return failure("parse_error", "Completed JSON is invalid");
  }
}

export async function writeCompletedData(data) {
  const handle = await getCompletedFileHandle();
  if (!handle) return failure("missing_file", "No completed JSON file is bound");

  const permission = await ensureFilePermission(handle, "readwrite");
  if (!permission.ok) return permission;

  try {
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify(normalizeCompletedData(data), null, 2)}\n`);
    await writable.close();
    return { ok: true, fileName: handle.name };
  } catch (error) {
    if (isPermissionError(error)) return failure("permission_denied", PERMISSION_MESSAGE);
    return failure("write_error", "Completed JSON write failed");
  }
}

export async function appendCompletedRecordToFile(text, completedAt) {
  const result = await readCompletedData();
  if (!result.ok) return result;
  return writeCompletedData(appendCompletedRecord(result.data, text, completedAt));
}

async function saveCompletedFileHandle(handle) {
  const db = await openDatabase();
  await putInStore(db, COMPLETED_HANDLE_KEY, handle);
  await chromeStorageSet({
    [COMPLETED_META_KEY]: {
      fileName: handle?.name || "todo-completed.json",
      boundAt: new Date().toISOString()
    }
  });
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

function chromeStorageSet(value) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) return resolve();
    chrome.storage.local.set(value, resolve);
  });
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
    const request = db.transaction(HANDLE_STORE, "readwrite").objectStore(HANDLE_STORE).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
