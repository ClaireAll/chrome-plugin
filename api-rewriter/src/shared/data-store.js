import { DEFAULT_DATA_FILE_NAME } from "./constants.js";
import { createEmptyData, normalizeData } from "./domain.js";

const DATA_STORAGE_KEY = "apiRewriterData";
const DATA_LOCK_NAME = "api-rewriter-data-write";

let localDataLock = Promise.resolve();

// 从浏览器本地存储读取并规范化规则、模板与接口过滤项。
export async function readStoredData() {
  try {
    const stored = await chromeStorageGet(DATA_STORAGE_KEY);
    return { ok: true, data: normalizeData(stored?.[DATA_STORAGE_KEY] || createEmptyData()) };
  } catch (error) {
    return failure("read_error", error?.message || "读取浏览器本地数据失败");
  }
}

// 读取最新数据、应用一次修改并串行写回浏览器本地存储。
export async function mutateStoredData(mutator) {
  return withDataLock(async () => {
    const current = await readStoredData();
    if (!current.ok) return current;
    try {
      const nextData = normalizeData(mutator(current.data));
      return writeStoredData(nextData);
    } catch (error) {
      return failure("mutation_error", error?.message || "保存浏览器本地数据失败");
    }
  });
}

// 用导入内容完整替换浏览器本地规则、模板与接口过滤项。
export async function replaceStoredData(data) {
  return withDataLock(async () => {
    try {
      return await writeStoredData(normalizeData(data));
    } catch (error) {
      return failure("replace_error", error?.message || "导入数据失败");
    }
  });
}

// 让用户选择 JSON 文件，并读取其中的规则、模板与接口过滤项作为待导入数据。
export async function pickImportDataFile() {
  if (!globalThis.showOpenFilePicker) return failure("unsupported", "当前浏览器不支持导入本地 JSON 文件");
  let handle;
  try {
    [handle] = await globalThis.showOpenFilePicker(filePickerOptions());
  } catch (error) {
    return isPickerCancelled(error)
      ? failure("picker_cancelled", "未选择 JSON 文件")
      : failure("picker_error", error?.message || "选择 JSON 文件失败");
  }

  try {
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = text.trim() ? JSON.parse(text) : createEmptyData();
    return { ok: true, data: normalizeData(parsed), fileName: file.name || handle.name };
  } catch (error) {
    return failure("parse_error", error?.message || "本地 JSON 文件格式错误");
  }
}

// 让用户选择保存位置，并把当前浏览器数据导出为格式化 JSON 文件。
export async function exportDataFile(data) {
  if (!globalThis.showSaveFilePicker) return failure("unsupported", "当前浏览器不支持导出本地 JSON 文件");
  let handle;
  try {
    handle = await globalThis.showSaveFilePicker({
      suggestedName: DEFAULT_DATA_FILE_NAME,
      ...filePickerOptions()
    });
  } catch (error) {
    return isPickerCancelled(error)
      ? failure("picker_cancelled", "未选择导出位置")
      : failure("picker_error", error?.message || "选择导出位置失败");
  }

  try {
    const normalized = normalizeData(data);
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify(normalized, null, 2)}\n`);
    await writable.close();
    return { ok: true, data: normalized, fileName: handle.name || DEFAULT_DATA_FILE_NAME };
  } catch (error) {
    return failure("write_error", error?.message || "导出 JSON 文件失败");
  }
}

// 将规范化数据写入浏览器本地存储并返回保存后的快照。
async function writeStoredData(data) {
  const normalized = normalizeData(data);
  try {
    await chromeStorageSet({ [DATA_STORAGE_KEY]: normalized });
    return { ok: true, data: normalized };
  } catch (error) {
    return failure("write_error", error?.message || "写入浏览器本地数据失败");
  }
}

// 将所有浏览器数据修改限制为串行执行，避免并发覆盖。
function withDataLock(operation) {
  if (globalThis.navigator?.locks?.request) return globalThis.navigator.locks.request(DATA_LOCK_NAME, operation);
  const task = localDataLock.then(operation, operation);
  localDataLock = task.catch(() => {});
  return task;
}

// 返回仅允许单个 JSON 文件的系统选择器配置。
function filePickerOptions() {
  return {
    id: "api-rewriter-json",
    startIn: "documents",
    types: [{ description: "JSON files", accept: { "application/json": [".json"] } }]
  };
}

// 判断文件选择器异常是否表示用户主动取消操作。
function isPickerCancelled(error) {
  return error?.name === "AbortError";
}

// 创建统一的失败返回结构。
function failure(reason, message) {
  return { ok: false, reason, message };
}

// 读取扩展本地存储中的指定数据。
function chromeStorageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

// 写入扩展本地存储中的指定数据。
function chromeStorageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}
