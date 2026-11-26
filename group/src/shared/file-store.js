import { createEmptyData, normalizeData } from "./domain.js";

const DB_NAME = "group-extension";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const FILE_HANDLE_KEY = "group-json";
const FILE_META_KEY = "groupFileMeta";
const PERMISSION_MESSAGE = "需要在设置页授权 JSON 文件读写";
const PERMISSION_QUERY_TIMEOUT_MS = 1500;

export async function getFileStatus() {
  const handle = await getFileHandle();
  const meta = await chromeStorageGet(FILE_META_KEY);
  const permission = handle
    ? await queryFilePermission(handle, "readwrite").catch(() => "unknown")
    : "missing";
  return {
    bound: Boolean(handle),
    fileName: handle?.name || meta?.[FILE_META_KEY]?.fileName || "",
    boundAt: meta?.[FILE_META_KEY]?.boundAt || "",
    permission
  };
}

export async function saveFileHandle(handle) {
  const db = await openDatabase();
  await putInStore(db, FILE_HANDLE_KEY, handle);
  await chromeStorageSet({
    [FILE_META_KEY]: {
      fileName: handle?.name || "group.json",
      boundAt: new Date().toISOString()
    }
  });
}

export async function getFileHandle() {
  try {
    const db = await openDatabase();
    return await getFromStore(db, FILE_HANDLE_KEY);
  } catch {
    return null;
  }
}

export async function clearFileHandle() {
  const db = await openDatabase();
  await deleteFromStore(db, FILE_HANDLE_KEY);
  await chromeStorageSet({ [FILE_META_KEY]: null });
}

export async function pickExistingJsonFile(options = {}) {
  if (!globalThis.showOpenFilePicker) {
    return failure("unsupported", "当前浏览器不支持直接绑定本地 JSON 文件");
  }

  try {
    const [handle] = await globalThis.showOpenFilePicker({
      multiple: false,
      ...filePickerDefaults(options),
      types: [
        {
          description: "JSON files",
          accept: { "application/json": [".json"] }
        }
      ]
    });
    await saveFileHandle(handle);
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return await readGroupData();
  } catch (error) {
    return failure("picker_cancelled", error?.message || "未选择 JSON 文件");
  }
}

export async function createJsonFile(options = {}) {
  if (!globalThis.showSaveFilePicker) {
    return failure("unsupported", "当前浏览器不支持创建本地 JSON 文件");
  }

  try {
    const handle = await globalThis.showSaveFilePicker({
      suggestedName: options.fileName || "group.json",
      ...filePickerDefaults(options),
      types: [
        {
          description: "JSON files",
          accept: { "application/json": [".json"] }
        }
      ]
    });
    await saveFileHandle(handle);
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return await writeGroupData(createEmptyData());
  } catch (error) {
    return failure("picker_cancelled", error?.message || "未创建 JSON 文件");
  }
}

export async function saveAsJsonFile(data, options = {}) {
  if (!globalThis.showSaveFilePicker) {
    return failure("unsupported", "当前浏览器不支持另存本地 JSON 文件");
  }

  try {
    const handle = await globalThis.showSaveFilePicker({
      suggestedName: options.fileName || "group.json",
      ...filePickerDefaults(options),
      types: [
        {
          description: "JSON files",
          accept: { "application/json": [".json"] }
        }
      ]
    });
    await saveFileHandle(handle);
    const permission = await ensureFilePermission(handle, "readwrite", { allowRequest: true });
    if (!permission.ok) return permission;
    return await writeGroupData(normalizeData(data));
  } catch (error) {
    return failure("picker_cancelled", error?.message || "未另存 JSON 文件");
  }
}

export async function requestStoredFilePermission(mode = "readwrite") {
  const handle = await getFileHandle();
  if (!handle) return failure("missing_file", "尚未绑定 group.json 文件");
  return ensureFilePermission(handle, mode, { allowRequest: true });
}

export async function readGroupData() {
  const handle = await getFileHandle();
  if (!handle) return failure("missing_file", "尚未绑定 group.json 文件");

  const permission = await ensureFilePermission(handle, "read");
  if (!permission.ok) return permission;

  try {
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = text.trim() ? JSON.parse(text) : createEmptyData();
    return { ok: true, data: normalizeData(parsed), fileName: handle.name };
  } catch (error) {
    if (isPermissionError(error)) {
      return failure("permission_denied", PERMISSION_MESSAGE);
    }
    return failure("parse_error", error?.message || "文件格式错误，请手动修复或重新选择文件");
  }
}

export async function writeGroupData(data) {
  const handle = await getFileHandle();
  if (!handle) return failure("missing_file", "尚未绑定 group.json 文件");

  const permission = await ensureFilePermission(handle, "readwrite");
  if (!permission.ok) return permission;

  try {
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify(normalizeData(data), null, 2)}\n`);
    await writable.close();
    return { ok: true, fileName: handle.name };
  } catch (error) {
    if (isPermissionError(error)) {
      return failure("permission_denied", PERMISSION_MESSAGE);
    }
    return failure("write_error", error?.message || "保存失败，请检查文件权限或重新选择文件");
  }
}

function failure(reason, message) {
  return { ok: false, reason, message };
}

function filePickerDefaults(options) {
  return {
    ...(options.pickerId ? { id: options.pickerId } : {}),
    ...(options.startIn ? { startIn: options.startIn } : {})
  };
}

export async function ensureFilePermission(handle, mode, options = {}) {
  try {
    const permissionOptions = { mode };
    const current = await queryFilePermission(handle, mode);
    if (current === "granted") return { ok: true };
    if (options.allowRequest && typeof handle.requestPermission === "function") {
      const requested = await handle.requestPermission(permissionOptions);
      if (requested === "granted") return { ok: true };
    }
    return failure("permission_denied", PERMISSION_MESSAGE);
  } catch (error) {
    if (/activation/i.test(error?.message || "")) {
      return failure("permission_denied", PERMISSION_MESSAGE);
    }
    return failure("permission_denied", error?.message || PERMISSION_MESSAGE);
  }
}

function isPermissionError(error) {
  return error?.name === "NotAllowedError" || /permission|activation/i.test(error?.message || "");
}

async function queryFilePermission(handle, mode) {
  if (typeof handle.queryPermission !== "function") return "unknown";
  let timeoutId;
  try {
    // Chrome can leave permission queries for a restored file handle pending.
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve("unknown"), PERMISSION_QUERY_TIMEOUT_MS);
    });
    return await Promise.race([handle.queryPermission({ mode }), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putInStore(db, key, value) {
  return transact(db, "readwrite", (store) => store.put(value, key));
}

function getFromStore(db, key) {
  return transact(db, "readonly", (store) => store.get(key));
}

function deleteFromStore(db, key) {
  return transact(db, "readwrite", (store) => store.delete(key));
}

function transact(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE, mode);
    const store = transaction.objectStore(HANDLE_STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function chromeStorageGet(key) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get(key, resolve);
  });
}

function chromeStorageSet(value) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set(value, resolve);
  });
}
