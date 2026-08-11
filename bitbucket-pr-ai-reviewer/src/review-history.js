export const REVIEW_HISTORY_KEY = "bbai-review-history";
export const MAX_REVIEW_HISTORY = 3;
export const REVIEW_ENGINE_VERSION = "2026-08-11-human-readable-v4";

export function createReviewKey(pullRequest) {
  return [
    pullRequest?.origin || "",
    pullRequest?.projectKey || "",
    pullRequest?.repoSlug || "",
    pullRequest?.pullRequestId || ""
  ].join("|");
}

export function createReviewRecord({ url, result, reviewedAt = new Date().toISOString() }) {
  const reviewKey = createReviewKey(result?.pullRequest);
  const id = `${reviewedAt}-${reviewKey}`;
  const counts = countActiveFindings(result);

  return {
    id,
    reviewKey,
    engineVersion: REVIEW_ENGINE_VERSION,
    reviewedAt,
    url,
    title: result?.pullRequestInfo?.title || `${result?.pullRequest?.repoSlug || "PR"}#${result?.pullRequest?.pullRequestId || ""}`,
    urgentCount: counts.urgentCount,
    suggestionCount: counts.suggestionCount,
    result
  };
}

export function updateReviewRecord(record, result, updatedAt = new Date().toISOString()) {
  const counts = countActiveFindings(result);
  const nextRecord = {
    ...record,
    updatedAt,
    urgentCount: counts.urgentCount,
    suggestionCount: counts.suggestionCount,
    result
  };

  if (Object.prototype.hasOwnProperty.call(record || {}, "engineVersion")) {
    nextRecord.engineVersion = record.engineVersion;
  }

  return nextRecord;
}

export function upsertReviewHistory(history, record, limit = MAX_REVIEW_HISTORY, preserveIds = []) {
  const sorted = [record, ...(Array.isArray(history) ? history : []).filter((item) => item?.id !== record.id)]
    .filter(isValidRecord)
    .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
  const requiredIds = new Set([record.id, ...(Array.isArray(preserveIds) ? preserveIds : [])].filter(Boolean));
  const selected = sorted.filter((item) => requiredIds.has(item.id)).slice(0, limit);

  for (const item of sorted) {
    if (selected.length >= limit) break;
    if (!selected.some((selectedItem) => selectedItem.id === item.id)) selected.push(item);
  }

  return selected.sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
}

export function findLatestReviewForPullRequest(history, pullRequest) {
  const reviewKey = createReviewKey(pullRequest);

  return (Array.isArray(history) ? history : []).find((record) => record?.reviewKey === reviewKey) || null;
}

export function decorateReviewRecord(record) {
  if (!isValidRecord(record)) return record;
  return {
    ...record,
    stale: isReviewRecordStale(record)
  };
}

export function isReviewRecordStale(record) {
  return record?.engineVersion !== REVIEW_ENGINE_VERSION;
}

function isValidRecord(record) {
  return Boolean(record?.id && record?.reviewKey && record?.reviewedAt && record?.result);
}

function countActiveFindings(result) {
  const findings = (Array.isArray(result?.findings) ? result.findings : []).filter(
    (finding) => finding?.reviewStatus !== "dismissed"
  );

  return {
    urgentCount: findings.filter((finding) => finding?.severity === "urgent").length,
    suggestionCount: findings.filter((finding) => finding?.severity === "suggestion").length
  };
}
