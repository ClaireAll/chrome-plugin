import {
  buildFindingFeedbackPrompt,
  buildReviewPrompt,
  buildVisualEvidencePrompt,
  extractChatCompletionText,
  extractResponseText,
  parseFindingFeedbackResponse,
  parseReviewResponse,
  parseVisualEvidenceResponse
} from "./review-engine.js";
import "./image-attachments.js";

const ImageAttachments = globalThis.BitbucketPrAiReviewerImages;

export async function reviewDiffChunk({
  settings,
  pullRequest,
  pullRequestInfo,
  commits,
  changedFiles,
  diffChunk,
  chunkIndex,
  totalChunks,
  followUpFeedback = "",
  previousFindings = [],
  visualEvidence = "",
  signal
}) {
  const prompt = buildReviewPrompt({
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    diffChunk,
    chunkIndex,
    totalChunks,
    reviewRules: settings.reviewRules,
    followUpFeedback,
    previousFindings,
    visualEvidence
  });

  const { value: findings, rawText } = await requestStructuredCompletion(settings, prompt, parseReviewResponse, { signal });

  return {
    findings,
    rawText
  };
}

export async function reviewFindingFeedback({
  settings,
  pullRequest,
  pullRequestInfo,
  commits,
  changedFiles,
  diffText,
  finding,
  category,
  feedback,
  feedbackRounds,
  images = [],
  signal
}) {
  const prompt = buildFindingFeedbackPrompt({
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    diffText,
    finding,
    category,
    feedback,
    feedbackRounds,
    reviewRules: settings.reviewRules
  });

  const { value, rawText } = await requestStructuredCompletion(settings, prompt, parseFindingFeedbackResponse, { images, signal });
  return {
    ...value,
    rawText
  };
}

export async function extractVisualEvidence({ settings, feedback, images, signal }) {
  const prompt = buildVisualEvidencePrompt({ feedback });
  const { value } = await requestStructuredCompletion(settings, prompt, parseVisualEvidenceResponse, { images, signal });
  return value;
}

export function buildChatCompletionBody(settings, prompt, images = []) {
  return {
    model: settings.deepseekModel,
    messages: [
      {
        role: "system",
        content: prompt.system
      },
      {
        role: "user",
        content: ImageAttachments.buildUserContent(prompt.user, images)
      }
    ],
    temperature: 0.1,
    max_tokens: 8192,
    response_format: {
      type: "json_object"
    }
  };
}

async function requestJsonCompletion(settings, prompt, { images = [], signal } = {}) {
  const response = await fetch(`${settings.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${settings.deepseekApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildChatCompletionBody(settings, prompt, images))
  });

  if (!response.ok) {
    throw new Error(await formatDeepSeekError(response, images.length > 0));
  }

  const payload = await response.json();
  const text = extractChatCompletionText(payload) || extractResponseText(payload);
  if (text) return text;

  const finishReason = payload?.choices?.[0]?.finish_reason;
  const reason = finishReason ? `，finish_reason=${finishReason}` : "";
  throw new Error(`DeepSeek 未返回评审内容${reason}。`);
}

async function requestStructuredCompletion(settings, prompt, parser, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawText = await requestJsonCompletion(settings, prompt, options);
      return { value: parser(rawText), rawText };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
      if (attempt > 0 || !isRetryableStructuredResponseError(error)) throw error;
    }
  }

  throw lastError;
}

function isRetryableStructuredResponseError(error) {
  return /DeepSeek (?:未返回|返回的.*JSON 格式异常)/.test(String(error?.message || error));
}

async function formatDeepSeekError(response, hasImages = false) {
  const text = await response.text().catch(() => "");
  if (hasImages && isUnsupportedImageError(response.status, text)) {
    return "当前模型或接口不支持图片复审，请更换支持视觉输入的模型。";
  }
  const preview = text ? ` ${text.slice(0, 500)}` : "";
  return `DeepSeek 评审请求失败：HTTP ${response.status}.${preview}`;
}

export function isUnsupportedImageError(status, text) {
  if (![400, 415, 422].includes(Number(status))) return false;

  const message = String(text || "");
  const mentionsImages = /(image_url|image input|vision|multimodal|image content|图片|视觉)/i.test(message);
  const unsupported = /(not supported|unsupported|does not support|invalid content|不支持)/i.test(message);
  return mentionsImages && unsupported;
}
