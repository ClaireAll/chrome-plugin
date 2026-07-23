import {
  getCompletedFileStatus,
  mutateCompletedData as mutateLocalCompletedData,
  readCompletedData as readLocalCompletedData,
  writeCompletedData as writeLocalCompletedData,
  appendCompletedRecordToFile
} from "./completed-file-store.js";
import { deleteCompletedRecord, updateCompletedRecordText } from "./domain.js";

const DATA_LOCATION_KEY = "todoCompletedDataLocation";

export async function getCompletedStatus() {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return getCompletedFileStatus();
}

export async function readCompletedData() {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return readLocalCompletedData();
}

export async function writeCompletedData(data) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return writeLocalCompletedData(data);
}

export async function appendCompletedRecord(record) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return appendCompletedRecordToFile(record?.text, record?.completedAt);
}

export async function updateCompletedRecord(recordIndex, text) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return mutateLocalCompletedData((data) => updateCompletedRecordText(data, recordIndex, text));
}

export async function deleteCompletedRecordAt(recordIndex) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return mutateLocalCompletedData((data) => deleteCompletedRecord(data, recordIndex));
}

async function isRemoteMode() {
  const result = await chromeStorageGet(DATA_LOCATION_KEY);
  return result[DATA_LOCATION_KEY]?.mode === "remote";
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
