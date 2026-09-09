import {
  getCompletedFileStatus,
  mutateCompletedData as mutateLocalCompletedData,
  readCompletedData as readLocalCompletedData,
  writeCompletedData as writeLocalCompletedData,
  appendCompletedRecordToFile
} from "./completed-file-store.ts";
import { deleteCompletedRecord, updateCompletedRecordText } from "./domain.ts";
import type { CompletedRecord } from "./domain";

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

export async function appendCompletedRecord(record: Partial<CompletedRecord> | null | undefined) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return appendCompletedRecordToFile(record?.text, record?.completedAt);
}

export async function updateCompletedRecord(recordIndex: number, text: string) {
  if (await isRemoteMode()) return failure("unsupported_remote", "Remote completed data is not supported");
  return mutateLocalCompletedData((data) => updateCompletedRecordText(data, recordIndex, text));
}

export async function deleteCompletedRecordAt(recordIndex: number) {
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

function chromeStorageGet(key: string): Promise<Record<string, any>> {
  return new Promise<Record<string, any>>((resolve) => {
    if (!globalThis.chrome?.storage?.local) return resolve({});
    (chrome.storage.local.get as any)(key, resolve);
  });
}
