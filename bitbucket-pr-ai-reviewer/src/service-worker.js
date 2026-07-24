import { fetchPullRequestDiff } from "./bitbucket-client.js";
import { extractVisualEvidence, reviewDiffChunk, reviewFindingFeedback } from "./deepseek-client.js";
import "./image-attachments.js";
import { chunkDiff, mergeFindings } from "./review-engine.js";
import {
  REVIEW_HISTORY_KEY,
  createReviewKey,
  createReviewRecord,
  findLatestReviewForPullRequest,
  updateReviewRecord,
  upsertReviewHistory
} from "./review-history.js";
import { normalizeSettings, validateSettings } from "./settings.js";
import { parsePullRequestUrl } from "./url.js";

let historyMutationQueue = Promise.resolve();
const activeRequests = new Map();
const ImageAttachments = globalThis.BitbucketPrAiReviewerImages;

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "get-settings":
      return { settings: await loadSettings() };
    case "save-settings":
      return { settings: await saveSettings(message.settings) };
    case "reset-settings":
      return { settings: await saveSettings({}) };
    case "open-options":
      await chrome.runtime.openOptionsPage();
      return {};
    case "get-review-history":
      return await getReviewHistory(message.url || sender.tab?.url);
    case "get-review-request-status":
      return getReviewRequestStatus(message.url || sender.tab?.url);
    case "delete-review-history":
      return { history: await deleteReviewHistoryRecord(message.id) };
    case "cancel-review-request":
      cancelReviewRequest(message.requestId);
      return {};
    case "review-current-pr":
      return await runReviewRequest(message.requestId, async (signal) => ({
        ...(await reviewCurrentPullRequest(message.url || sender.tab?.url, sender.tab?.id, {
          feedback: message.feedback,
          baseReviewId: message.baseReviewId,
          requestId: message.requestId,
          images: message.images,
          signal
        }))
      }), { url: message.url || sender.tab?.url, tabId: sender.tab?.id, kind: "review" });
    case "review-finding-feedback":
      return await runReviewRequest(message.requestId, (signal) =>
        reviewFindingWithFeedback({
          url: message.url || sender.tab?.url,
          tabId: sender.tab?.id,
          reviewId: message.reviewId,
          findingIndex: message.findingIndex,
          category: message.category,
          feedback: message.feedback,
          requestId: message.requestId,
          images: message.images,
          signal
        }),
        { url: message.url || sender.tab?.url, tabId: sender.tab?.id, kind: "finding" }
      );
    default:
      throw new Error(`未知扩展消息：${message?.type || "缺少类型"}`);
  }
}

async function reviewCurrentPullRequest(
  url,
  tabId,
  { feedback = "", baseReviewId = "", requestId = "", images = [], signal } = {}
) {
  const settings = validateSettings(await loadSettings());
  const pullRequest = parsePullRequestUrl(url);
  const progress = (status) => notifyProgress(tabId, status, { requestId, url });
  const normalizedFeedback = normalizeFeedback(feedback);
  const normalizedImages = ImageAttachments.normalizeImagePayloads(images);
  if (normalizedImages.length && !normalizedFeedback) {
    throw new Error("请先填写希望 AI 补充审查的内容。");
  }
  const baseRecord = normalizedFeedback ? await getReviewRecordForPullRequest(baseReviewId, pullRequest) : null;
  const previousFindings = (baseRecord?.result?.findings || []).filter((finding) => finding?.reviewStatus !== "dismissed");

  progress(normalizedFeedback ? "正在根据补充反馈重新读取合并请求..." : "正在读取合并请求元数据...");
  const { pullRequestInfo, commits, changedFiles, diffText } = await fetchPullRequestDiff(pullRequest, settings, progress, signal);
  signal?.throwIfAborted();
  const chunks = chunkDiff(diffText, settings.maxDiffCharsPerChunk);

  if (!chunks.length) {
    throw new Error("没有生成可评审的 diff 片段。");
  }

  let visualEvidence = "";
  if (normalizedImages.length) {
    progress("正在提取图片中的视觉证据...");
    visualEvidence = await extractVisualEvidence({
      settings,
      feedback: normalizedFeedback,
      images: normalizedImages,
      signal
    });
  }

  const reviewedChunks = [];
  for (let index = 0; index < chunks.length; index += 1) {
    signal?.throwIfAborted();
    progress(`正在评审第 ${index + 1}/${chunks.length} 个 diff 片段...`);
    reviewedChunks.push(
      await reviewDiffChunk({
        settings,
        pullRequest,
        pullRequestInfo,
        commits,
        changedFiles,
        diffChunk: chunks[index],
        chunkIndex: index,
        totalChunks: chunks.length,
        followUpFeedback: normalizedFeedback,
        previousFindings,
        visualEvidence,
        signal
      })
    );
  }

  const findings = mergeFindings(reviewedChunks);
  progress("评审完成。");

  const result = {
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    chunksReviewed: chunks.length,
    findings,
    ...(normalizedFeedback
      ? {
          followUpReview: {
            baseReviewId: baseRecord?.id || "",
            feedback: normalizedFeedback
          }
        }
      : {})
  };
  signal?.throwIfAborted();
  const history = await saveReviewHistory(url, result, { preserveReviewId: baseRecord?.id || "" });

  return {
    result,
    history
  };
}

async function reviewFindingWithFeedback({
  url,
  tabId,
  reviewId,
  findingIndex,
  category,
  feedback,
  requestId,
  images = [],
  signal
}) {
  const normalizedFeedback = normalizeFeedback(feedback, true);
  const normalizedCategory = normalizeCategory(category);
  const normalizedImages = ImageAttachments.normalizeImagePayloads(images);
  const settings = validateSettings(await loadSettings());
  const pullRequest = parsePullRequestUrl(url);
  const history = await loadStableReviewHistory();
  const record = history.find((item) => item?.id === reviewId);

  if (!record) {
    throw new Error("找不到要复审的历史记录，请重新打开评审详情。");
  }

  if (record.reviewKey !== createReviewKey(pullRequest)) {
    throw new Error("这条评审记录不属于当前合并请求。");
  }

  const index = Number.parseInt(findingIndex, 10);
  const findings = Array.isArray(record.result?.findings) ? record.result.findings : [];
  const finding = Number.isInteger(index) && index >= 0 ? findings[index] : null;

  if (!finding) {
    throw new Error("找不到要复审的意见，它可能已经发生变化。");
  }

  const recordRevision = String(record.updatedAt || record.reviewedAt || "");
  const progress = (status) => notifyProgress(tabId, status, { requestId, url });
  progress("正在重新读取这条意见对应的代码...");
  const { pullRequestInfo, commits, changedFiles, diffText } = await fetchPullRequestDiff(pullRequest, settings, progress, signal);
  signal?.throwIfAborted();
  const relevantDiff = selectRelevantDiff(diffText, finding.filePath, finding.line, settings.maxDiffCharsPerChunk);

  progress("AI 正在重新审查这条意见...");
  const reviewed = await reviewFindingFeedback({
    settings,
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    diffText: relevantDiff,
    finding,
    category: normalizedCategory,
    feedback: normalizedFeedback,
    feedbackRounds: finding.feedbackRounds,
    images: normalizedImages,
    signal
  });

  const reviewedAt = new Date().toISOString();
  signal?.throwIfAborted();
  const mutation = await mutateReviewHistory((currentHistory) => {
    const latestRecord = currentHistory.find((item) => item?.id === reviewId);
    if (!latestRecord) {
      throw new Error("这条评审记录已被删除，未保存本次复审结果。");
    }

    const latestRevision = String(latestRecord.updatedAt || latestRecord.reviewedAt || "");
    if (latestRevision !== recordRevision) {
      throw new Error("这条评审记录已在其他页面更新，请重新打开后再反馈。");
    }

    const latestFindings = Array.isArray(latestRecord.result?.findings) ? latestRecord.result.findings : [];
    const latestFinding = latestFindings[index];
    if (!latestFinding) {
      throw new Error("要复审的意见已经发生变化，请重新打开后再反馈。");
    }

    const feedbackRounds = [
      ...(Array.isArray(latestFinding.feedbackRounds) ? latestFinding.feedbackRounds : []),
      {
        id: `${reviewedAt}-${index}`,
        reviewedAt,
        category: normalizedCategory,
        feedback: normalizedFeedback,
        verdict: reviewed.verdict,
        response: reviewed.response,
        previousFinding: toFindingSnapshot(latestFinding)
      }
    ];
    const nextFinding = applyFindingFeedbackResult(latestFinding, reviewed, feedbackRounds);
    const nextFindings = latestFindings.map((item, itemIndex) => (itemIndex === index ? nextFinding : item));
    const result = {
      ...latestRecord.result,
      pullRequest,
      pullRequestInfo,
      commits,
      changedFiles,
      findings: nextFindings
    };
    const updatedRecord = updateReviewRecord(latestRecord, result, reviewedAt);

    return {
      history: currentHistory.map((item) => (item?.id === updatedRecord.id ? updatedRecord : item)),
      value: { result, reviewId: updatedRecord.id }
    };
  }, signal);
  progress("单条意见复审完成。");

  return {
    result: mutation.value.result,
    history: mutation.history,
    reviewId: mutation.value.reviewId,
    verdict: reviewed.verdict
  };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(null);
  return normalizeSettings(stored);
}

async function saveSettings(input) {
  const settings = normalizeSettings(input);
  await chrome.storage.local.set(settings);
  return settings;
}

function notifyProgress(tabId, status, { requestId = "", url = "" } = {}) {
  const activeRequest = activeRequests.get(String(requestId || ""));
  if (activeRequest) activeRequest.status = status;
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "review-progress", status, requestId, url }).catch(() => {});
}

async function getReviewHistory(url) {
  const history = await loadStableReviewHistory();
  let currentReview = null;

  try {
    currentReview = findLatestReviewForPullRequest(history, parsePullRequestUrl(url));
  } catch {
    currentReview = null;
  }

  return {
    history,
    currentReview
  };
}

async function loadReviewHistory() {
  const stored = await chrome.storage.local.get({ [REVIEW_HISTORY_KEY]: [] });
  return Array.isArray(stored[REVIEW_HISTORY_KEY]) ? stored[REVIEW_HISTORY_KEY] : [];
}

async function loadStableReviewHistory() {
  await historyMutationQueue.catch(() => {});
  return await loadReviewHistory();
}

async function saveReviewHistory(url, result, { preserveReviewId = "" } = {}) {
  const record = createReviewRecord({ url, result });
  const mutation = await mutateReviewHistory((history) => ({
    history: upsertReviewHistory(history, record, undefined, [preserveReviewId])
  }));
  return mutation.history;
}

async function deleteReviewHistoryRecord(id) {
  const mutation = await mutateReviewHistory((history) => ({
    history: history.filter((record) => record?.id !== id)
  }));
  return mutation.history;
}

async function getReviewRecordForPullRequest(reviewId, pullRequest) {
  if (!reviewId) return null;

  const record = (await loadStableReviewHistory()).find((item) => item?.id === reviewId);
  if (!record) {
    throw new Error("找不到作为补充审查基础的历史记录。");
  }

  if (record.reviewKey !== createReviewKey(pullRequest)) {
    throw new Error("补充审查的历史记录不属于当前合并请求。");
  }

  return record;
}

function mutateReviewHistory(mutator, signal) {
  const operation = historyMutationQueue.catch(() => {}).then(async () => {
    signal?.throwIfAborted();
    const currentHistory = await loadReviewHistory();
    signal?.throwIfAborted();
    const outcome = await mutator(currentHistory);
    const nextHistory = Array.isArray(outcome) ? outcome : outcome?.history;

    if (!Array.isArray(nextHistory)) {
      throw new Error("历史记录更新结果无效。");
    }

    signal?.throwIfAborted();
    await chrome.storage.local.set({ [REVIEW_HISTORY_KEY]: nextHistory });
    return {
      history: nextHistory,
      value: Array.isArray(outcome) ? undefined : outcome.value
    };
  });

  historyMutationQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function runReviewRequest(requestId, operation, metadata = {}) {
  const id = String(requestId || "").trim();
  if (!id) return await operation(undefined);

  cancelReviewRequest(id);
  const controller = new AbortController();
  const request = {
    controller,
    id,
    url: String(metadata.url || ""),
    reviewKey: getReviewRequestKey(metadata.url),
    tabId: metadata.tabId,
    kind: metadata.kind || "review",
    status: "正在启动评审...",
    startedAt: Date.now()
  };
  activeRequests.set(id, request);

  try {
    const result = await operation(controller.signal);
    notifyReviewRequestFinished(request, "review-completed");
    return result;
  } catch (error) {
    if (error?.name !== "AbortError") {
      notifyReviewRequestFinished(request, "review-failed", error.message || String(error));
    }
    throw error;
  } finally {
    if (activeRequests.get(id) === request) activeRequests.delete(id);
  }
}

function getReviewRequestStatus(url) {
  const reviewKey = getReviewRequestKey(url);
  const request = Array.from(activeRequests.values())
    .filter((item) => item.reviewKey === reviewKey)
    .sort((left, right) => right.startedAt - left.startedAt)[0];

  if (!request) return { active: false };
  return {
    active: true,
    requestId: request.id,
    kind: request.kind,
    status: request.status,
    startedAt: request.startedAt
  };
}

function getReviewRequestKey(url) {
  try {
    return createReviewKey(parsePullRequestUrl(url));
  } catch {
    return String(url || "");
  }
}

function notifyReviewRequestFinished(request, type, error = "") {
  if (!request.tabId) return;
  chrome.tabs
    .sendMessage(request.tabId, {
      type,
      requestId: request.id,
      url: request.url,
      error
    })
    .catch(() => {});
}

function cancelReviewRequest(requestId) {
  const id = String(requestId || "").trim();
  const request = activeRequests.get(id);
  if (!request) return false;

  request.controller.abort(new DOMException("评审请求已取消。", "AbortError"));
  activeRequests.delete(id);
  return true;
}

export {
  cancelReviewRequest,
  handleMessage,
  reviewCurrentPullRequest,
  reviewFindingWithFeedback,
  runReviewRequest
};

function normalizeFeedback(value, required = false) {
  const feedback = String(value || "").trim();

  if (required && !feedback) {
    throw new Error("请先填写要反馈给 AI 的内容。");
  }

  if (feedback.length > 4000) {
    throw new Error("反馈内容不能超过 4000 个字符。");
  }

  return feedback;
}

function normalizeCategory(value) {
  const category = String(value || "").trim();
  return ["结论不准确", "遗漏上下文", "建议不合适"].includes(category) ? category : "";
}

function selectRelevantDiff(diffText, filePath, line, maxChars) {
  const text = String(diffText || "").trim();
  const size = Math.max(4000, Number.parseInt(maxChars, 10) || 12000);
  const path = String(filePath || "").replace(/^a\//, "").replace(/^b\//, "").trim();
  const sections = text.split(/\n(?=diff --git )/g);
  const section = path
    ? sections.find((item) => {
        const header = item.split("\n", 1)[0] || "";
        const decodedHeader = decodeGitQuotedPath(header);
        return decodedHeader.includes(`a/${path}`) || decodedHeader.includes(`b/${path}`);
      })
    : null;
  const source = section || text;

  if (source.length <= size) return source;

  const targetLine = Number.parseInt(line, 10);
  const hunkIndex = Number.isFinite(targetLine) ? findTargetHunkIndex(source, targetLine) : -1;
  if (hunkIndex < 0) return source.slice(0, size);

  const header = source.split("\n", 1)[0] || "";
  const bodySize = Math.max(1, size - header.length - 2);
  const start = Math.max(0, hunkIndex - Math.floor(bodySize * 0.3));
  return `${header}\n${source.slice(start, start + bodySize)}`;
}

function findTargetHunkIndex(diff, targetLine) {
  const pattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@.*$/gm;
  let fallback = -1;
  let match = pattern.exec(diff);

  while (match) {
    const start = Number.parseInt(match[1], 10);
    const span = Number.parseInt(match[2] || "1", 10);
    if (targetLine >= start && targetLine < start + Math.max(1, span)) {
      return match.index;
    }
    if (start <= targetLine) fallback = match.index;
    match = pattern.exec(diff);
  }

  return fallback;
}

function toFindingSnapshot(finding) {
  return {
    severity: finding?.severity || "",
    filePath: finding?.filePath || "",
    line: finding?.line ?? null,
    title: finding?.title || "",
    detail: finding?.detail || "",
    suggestion: finding?.suggestion || ""
  };
}

function applyFindingFeedbackResult(finding, reviewed, feedbackRounds) {
  if (reviewed.verdict === "dismissed") {
    return {
      ...finding,
      reviewStatus: "dismissed",
      feedbackRounds
    };
  }

  if (reviewed.verdict === "revised") {
    return {
      ...reviewed.finding,
      reviewStatus: "active",
      feedbackRounds
    };
  }

  return {
    ...finding,
    reviewStatus: "active",
    feedbackRounds
  };
}

function decodeGitQuotedPath(value) {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\\") {
      output += value[index];
      continue;
    }

    const bytes = [];
    let cursor = index;
    while (value[cursor] === "\\" && /^[0-7]{3}$/.test(value.slice(cursor + 1, cursor + 4))) {
      bytes.push(Number.parseInt(value.slice(cursor + 1, cursor + 4), 8));
      cursor += 4;
    }

    if (bytes.length) {
      output += new TextDecoder().decode(Uint8Array.from(bytes));
      index = cursor - 1;
      continue;
    }

    const escaped = value[index + 1];
    if (escaped === "\\" || escaped === '"') {
      output += escaped;
      index += 1;
    } else {
      output += value[index];
    }
  }

  return output;
}
