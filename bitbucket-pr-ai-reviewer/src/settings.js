import { LOCAL_DEFAULT_SETTINGS } from "../local-default-settings.js";

export const DEFAULT_REVIEW_RULES = `Focus on actionable code review findings.
Prioritize correctness bugs, behavioral regressions, missing tests for changed behavior, security risks, data loss risks, and performance problems.
For frontend files such as JS, TS, TSX, Vue, CSS, and Less, also check state handling, rendering edge cases, accessibility, memoization, API contracts, and user-visible styling regressions.
Avoid style-only nitpicks unless they affect maintainability or product behavior.
Skip test-file diffs such as test.ts, *.test.ts, *.spec.ts, files under test/tests/__tests__, and .md documentation files; do not produce findings for those files.
For JSON files, review only the changed added/removed entries in the diff. Do not infer issues from unchanged neighboring JSON keys or missing surrounding context.
Do not report speculative findings based only on "may", "might", or "could". Each finding must explain the evidence from the current diff, such as the changed condition branch, data flow, call chain, API contract, state transition, or rendered result that creates a concrete failing path. If the evidence is insufficient, return no finding.
For every finding, provide structured evidence: changed code evidence, trigger condition, data/call/state/component flow, and counter-evidence checked from source context before reporting.
Return concrete file paths, line numbers when clear from the diff, and suggested fixes.
Except for code snippets, file paths, identifiers, API names, component names, library names, command names, and other proper nouns, write all review text in UTF-8 Simplified Chinese.`;

const DEFAULTS = {
  bitbucketBaseUrl: "https://code.fineres.com",
  bitbucketToken: "",
  bitbucketAuthScheme: "Bearer",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekApiKey: "",
  deepseekModel: "deepseek-v4-flash",
  maxDiffCharsPerChunk: 12000,
  contextLines: 20,
  reviewRules: DEFAULT_REVIEW_RULES,
  ...LOCAL_DEFAULT_SETTINGS
};

export function normalizeSettings(input = {}) {
  const bitbucketAuthScheme =
    String(input.bitbucketAuthScheme || DEFAULTS.bitbucketAuthScheme).toLowerCase() === "basic"
      ? "Basic"
      : "Bearer";

  const reviewRules = String(input.reviewRules ?? DEFAULTS.reviewRules).trim();

  return {
    bitbucketBaseUrl: trimOrDefault(input.bitbucketBaseUrl, DEFAULTS.bitbucketBaseUrl).replace(/\/+$/, ""),
    bitbucketToken: trimOrDefault(input.bitbucketToken, DEFAULTS.bitbucketToken),
    bitbucketAuthScheme,
    deepseekBaseUrl: trimOrDefault(input.deepseekBaseUrl, DEFAULTS.deepseekBaseUrl).replace(/\/+$/, ""),
    deepseekApiKey: trimOrDefault(input.deepseekApiKey, DEFAULTS.deepseekApiKey),
    deepseekModel: trimOrDefault(input.deepseekModel, DEFAULTS.deepseekModel),
    maxDiffCharsPerChunk: clampNumber(input.maxDiffCharsPerChunk, 4000, 50000, DEFAULTS.maxDiffCharsPerChunk),
    contextLines: normalizeContextLines(input.contextLines),
    reviewRules: reviewRules || DEFAULT_REVIEW_RULES
  };
}

export function validateSettings(settings) {
  const normalized = normalizeSettings(settings);
  const missing = [];

  if (!normalized.bitbucketToken) missing.push("Bitbucket 访问令牌");
  if (!normalized.deepseekApiKey) missing.push("DeepSeek API 密钥");
  if (!normalized.deepseekModel) missing.push("DeepSeek 模型");

  if (missing.length) {
    throw new Error(`缺少必要设置：${missing.join("、")}。`);
  }

  return normalized;
}

function trimOrDefault(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  const parsedFallback = Number.parseInt(fallback, 10);
  const safeFallback = Number.isFinite(parsedFallback) ? parsedFallback : min;

  if (!Number.isFinite(parsed)) return Math.max(min, Math.min(max, safeFallback));
  return Math.max(min, Math.min(max, parsed));
}

function normalizeContextLines(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULTS.contextLines;

  // Previous builds used 1000 as the minimum/default, which turns tiny diffs in large files into many review chunks.
  if (parsed >= 1000) return DEFAULTS.contextLines;

  return Math.max(0, Math.min(200, parsed));
}
