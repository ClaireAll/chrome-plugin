export async function fetchPullRequestDiff(pullRequest, settings, progress = () => {}, signal) {
  const headers = createBitbucketHeaders(settings);

  progress("正在获取合并请求详情...");
  const pullRequestInfo = await fetchPullRequestInfo(pullRequest.apiBase, headers, signal);

  progress("正在获取提交信息...");
  const commits = (await fetchAllPages(`${pullRequest.apiBase}/commits?limit=100`, headers, "获取提交信息失败", signal))
    .map(formatCommit)
    .filter((commit) => commit.message);

  progress("正在获取变更文件...");
  const changes = await fetchAllPages(`${pullRequest.apiBase}/changes?limit=1000`, headers, "获取变更文件失败", signal);
  const changedFiles = changes.map(formatChangePath).filter(Boolean);

  progress("正在获取合并请求 diff...");
  const diffUrl = `${pullRequest.apiBase}/diff?contextLines=${encodeURIComponent(settings.contextLines)}`;
  const diffResponse = await fetch(diffUrl, {
    signal,
    headers: {
      ...headers,
      Accept: "application/json, text/plain, */*"
    }
  });

  if (!diffResponse.ok) {
    throw new Error(await formatHttpError("获取 diff 失败", diffResponse));
  }

  const contentType = diffResponse.headers.get("content-type") || "";
  const rawDiff = await diffResponse.text();
  const diffText = formatDiffPayload(rawDiff, contentType);

  if (!diffText.trim()) {
    throw new Error("Bitbucket 返回了空 diff，无法评审。");
  }

  return {
    pullRequestInfo,
    commits,
    changedFiles,
    diffText
  };
}

const FINE_DESIGN_PROJECT_KEY = "FX";
const FINE_DESIGN_REPO_SLUG = "fine-design";
const FINE_DESIGN_REVIEW_REPOS = new Set(["fx-data-web", "fine-design-biz"]);
const COMPONENT_NAME_LIMIT = 12;
const COMPONENT_FILE_LIMIT = 8;
const COMPONENT_SOURCE_CHAR_LIMIT = 3000;
const REVIEW_EVIDENCE_CHANGED_FILE_LIMIT = 10;
const REVIEW_EVIDENCE_RELATED_FILE_LIMIT = 8;
const REVIEW_EVIDENCE_SOURCE_CHAR_LIMIT = 3600;
const REVIEW_EVIDENCE_EXT_PATTERN = /\.(tsx|ts|jsx|js|vue|less|css)$/i;
const REVIEW_EVIDENCE_TEST_FILE_PATTERN =
  /(^|\/)(__tests__|__test__|tests?|specs?)(\/|$)|(^|\/)(test|spec)\.(tsx?|jsx?|vue)$|\.(test|spec)\.(tsx?|jsx?|vue)$/i;

export async function fetchFineDesignComponentReferences(
  pullRequest,
  settings,
  diffText,
  progress = () => {},
  signal
) {
  if (!shouldUseFineDesignReferences(pullRequest)) {
    return { enabled: false, sourceRepository: "", componentNames: [], references: [], error: "" };
  }

  const componentNames = extractChangedComponentNames(diffText);
  if (!componentNames.length) {
    return { enabled: true, sourceRepository: "FX/fine-design", componentNames: [], references: [], error: "" };
  }

  try {
    progress("正在读取 Fine Design 组件参考...");
    const headers = createBitbucketHeaders(settings);
    const fileUrl = `${pullRequest.origin}/rest/api/latest/projects/${FINE_DESIGN_PROJECT_KEY}/repos/${FINE_DESIGN_REPO_SLUG}/files?limit=1000`;
    const files = (await fetchAllPages(fileUrl, headers, "读取 Fine Design 文件列表失败", signal))
      .map(formatRepositoryFilePath)
      .filter(isReferenceSourceFile);
    const matches = matchComponentFiles(componentNames, files).slice(0, COMPONENT_FILE_LIMIT);
    const references = [];

    for (const match of matches) {
      signal?.throwIfAborted();
      const source = await fetchRepositoryFileText(pullRequest.origin, headers, match.path, signal);
      if (source.trim()) {
        references.push({
          component: match.component,
          path: match.path,
          source: trimComponentSource(source)
        });
      }
    }

    return { enabled: true, sourceRepository: "FX/fine-design", componentNames, references, error: "" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      enabled: true,
      sourceRepository: "FX/fine-design",
      componentNames,
      references: [],
      error: error.message || String(error)
    };
  }
}

export async function fetchReviewEvidenceContext(
  pullRequest,
  pullRequestInfo,
  changedFiles,
  settings,
  progress = () => {},
  signal
) {
  const changedPaths = Array.from(new Set((changedFiles || []).map(normalizeChangePath).filter(isReviewEvidenceFile))).slice(
    0,
    REVIEW_EVIDENCE_CHANGED_FILE_LIMIT
  );
  if (!changedPaths.length) return { enabled: false, files: [], error: "" };

  const headers = createBitbucketHeaders(settings);
  const sourceRef = String(pullRequestInfo?.fromRef || "").trim();
  const files = [];

  progress("正在读取变更文件源码上下文...");
  for (const path of changedPaths) {
    signal?.throwIfAborted();
    const source = await fetchPullRequestRepositoryFileText(pullRequest, headers, path, sourceRef, signal).catch(() => "");
    if (source.trim()) {
      files.push({
        kind: "changed",
        path,
        source: trimReviewEvidenceSource(source)
      });
    }
  }

  try {
    const relatedPaths = await findRelatedReviewEvidencePaths(pullRequest, headers, sourceRef, changedPaths, files, signal);
    for (const path of relatedPaths) {
      signal?.throwIfAborted();
      const source = await fetchPullRequestRepositoryFileText(pullRequest, headers, path, sourceRef, signal).catch(() => "");
      if (source.trim()) {
        files.push({
          kind: "related",
          path,
          source: trimReviewEvidenceSource(source)
        });
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return { enabled: true, files, error: error.message || String(error) };
  }

  return { enabled: true, files, error: "" };
}

function createBitbucketHeaders(settings) {
  return {
    Authorization: `${settings.bitbucketAuthScheme} ${settings.bitbucketToken}`,
    Accept: "application/json"
  };
}

async function fetchPullRequestInfo(apiBase, headers, signal) {
  const response = await fetch(apiBase, { headers, signal });

  if (!response.ok) {
    throw new Error(await formatHttpError("获取合并请求详情失败", response));
  }

  return formatPullRequestInfo(await response.json());
}

async function fetchAllPages(firstUrl, headers, errorPrefix, signal) {
  const values = [];
  let url = firstUrl;
  let guard = 0;

  while (url && guard < 50) {
    guard += 1;
    const response = await fetch(url, { headers, signal });

    if (!response.ok) {
      throw new Error(await formatHttpError(errorPrefix, response));
    }

    const page = await response.json();
    values.push(...(Array.isArray(page.values) ? page.values : []));

    if (page.isLastPage !== false || page.nextPageStart == null) {
      break;
    }

    const next = new URL(url);
    next.searchParams.set("start", String(page.nextPageStart));
    url = next.toString();
  }

  return values;
}

function shouldUseFineDesignReferences(pullRequest) {
  return FINE_DESIGN_REVIEW_REPOS.has(String(pullRequest?.repoSlug || "").toLowerCase());
}

function extractChangedComponentNames(diffText) {
  const names = new Set();
  const componentPattern = /<\/?([A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?)\b/g;

  for (const line of String(diffText || "").split("\n")) {
    if (!/^[ +\-]/.test(line) || line.startsWith("+++") || line.startsWith("---")) continue;

    let match = componentPattern.exec(line);
    while (match && names.size < COMPONENT_NAME_LIMIT) {
      const name = match[1].split(".")[0];
      if (!["React", "Fragment"].includes(name)) names.add(name);
      match = componentPattern.exec(line);
    }

    if (names.size >= COMPONENT_NAME_LIMIT) break;
  }

  return Array.from(names);
}

function formatRepositoryFilePath(file) {
  if (typeof file === "string") return file;
  const path =
    file?.path?.toString ||
    file?.path ||
    file?.displayId ||
    file?.components?.join("/") ||
    "";

  return typeof path === "function" ? path.call(file.path || file) : path;
}

function isReferenceSourceFile(path) {
  const value = String(path || "");
  return /\.(tsx|jsx|ts|js)$/.test(value) && !/(^|\/)(__tests__|test|tests|stories|demo|demos|mock|mocks)(\/|\.|$)/i.test(value);
}

function matchComponentFiles(componentNames, files) {
  const matches = [];

  for (const component of componentNames) {
    const ranked = files
      .map((path) => ({ component, path, score: scoreComponentFile(component, path) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.path.length - right.path.length)
      .slice(0, 2);
    matches.push(...ranked);
  }

  return matches
    .filter((item, index, list) => list.findIndex((other) => other.path === item.path) === index)
    .sort((left, right) => right.score - left.score || left.path.length - right.path.length);
}

function scoreComponentFile(component, path) {
  const target = component.toLowerCase();
  const value = String(path || "").replace(/\\/g, "/");
  const lower = value.toLowerCase();
  const fileName = lower.split("/").pop() || "";
  const baseName = fileName.replace(/\.(tsx|jsx|ts|js)$/, "");
  const segments = lower.split("/");
  let score = 0;

  if (baseName === target) score += 100;
  if (segments.includes(target)) score += 80;
  if (lower.includes(`/${target}/`)) score += 60;
  if (baseName === "index" && segments.at(-2) === target) score += 55;
  if (/\.(tsx|jsx)$/.test(lower)) score += 8;
  if (/(readme|type|types|style|styles|constant|constants|util|utils)/i.test(fileName)) score -= 20;

  return score;
}

async function fetchRepositoryFileText(origin, headers, path, signal) {
  const encodedPath = encodeRepositoryPath(path);
  const response = await fetch(
    `${origin}/rest/api/latest/projects/${FINE_DESIGN_PROJECT_KEY}/repos/${FINE_DESIGN_REPO_SLUG}/browse/${encodedPath}?raw`,
    {
      signal,
      headers: {
        ...headers,
        Accept: "text/plain, application/json, */*"
      }
    }
  );

  if (!response.ok) {
    throw new Error(await formatHttpError(`读取 Fine Design 组件 ${path} 失败`, response));
  }

  return formatRepositoryFilePayload(await response.text(), response.headers.get("content-type") || "");
}

async function fetchPullRequestRepositoryFileText(pullRequest, headers, path, sourceRef, signal) {
  const encodedProject = encodeURIComponent(pullRequest.projectKey);
  const encodedRepo = encodeURIComponent(pullRequest.repoSlug);
  const encodedPath = encodeRepositoryPath(path);
  const refQuery = sourceRef ? `&at=${encodeURIComponent(sourceRef)}` : "";
  const response = await fetch(
    `${pullRequest.origin}/rest/api/latest/projects/${encodedProject}/repos/${encodedRepo}/browse/${encodedPath}?raw${refQuery}`,
    {
      signal,
      headers: {
        ...headers,
        Accept: "text/plain, application/json, */*"
      }
    }
  );

  if (!response.ok) {
    throw new Error(await formatHttpError(`读取源码文件 ${path} 失败`, response));
  }

  return formatRepositoryFilePayload(await response.text(), response.headers.get("content-type") || "");
}

async function findRelatedReviewEvidencePaths(pullRequest, headers, sourceRef, changedPaths, changedSources, signal) {
  const fileUrl = new URL(
    `${pullRequest.origin}/rest/api/latest/projects/${encodeURIComponent(pullRequest.projectKey)}/repos/${encodeURIComponent(pullRequest.repoSlug)}/files`
  );
  fileUrl.searchParams.set("limit", "1000");
  if (sourceRef) fileUrl.searchParams.set("at", sourceRef);

  const repositoryFiles = (await fetchAllPages(fileUrl.toString(), headers, "读取仓库文件列表失败", signal))
    .map(formatRepositoryFilePath)
    .map(normalizeRepositoryPath)
    .filter(isReviewEvidenceFile);
  const repositoryFileSet = new Set(repositoryFiles);
  const changedPathSet = new Set(changedPaths);
  const related = [];

  for (const path of changedPaths) {
    addRelatedPathCandidates(related, repositoryFileSet, changedPathSet, getSiblingEvidenceCandidates(path));
  }

  for (const file of changedSources) {
    const importCandidates = extractRelativeImportSpecifiers(file.source).flatMap((specifier) =>
      resolveRelativeImportCandidates(file.path, specifier, repositoryFileSet)
    );
    addRelatedPathCandidates(related, repositoryFileSet, changedPathSet, importCandidates);
  }

  return related.slice(0, REVIEW_EVIDENCE_RELATED_FILE_LIMIT);
}

function addRelatedPathCandidates(target, repositoryFileSet, changedPathSet, candidates) {
  for (const candidate of candidates) {
    if (!repositoryFileSet.has(candidate) || changedPathSet.has(candidate) || target.includes(candidate)) continue;
    target.push(candidate);
    if (target.length >= REVIEW_EVIDENCE_RELATED_FILE_LIMIT) return;
  }
}

function getSiblingEvidenceCandidates(path) {
  const directory = getDirectoryName(path);
  const baseName = getBaseNameWithoutExtension(path);
  const prefix = directory ? `${directory}/` : "";
  return [
    `${prefix}${baseName}.types.ts`,
    `${prefix}${baseName}.type.ts`,
    `${prefix}types.ts`,
    `${prefix}constants.ts`,
    `${prefix}utils.ts`,
    `${prefix}index.ts`,
    `${prefix}index.tsx`
  ];
}

function extractRelativeImportSpecifiers(source) {
  const imports = new Set();
  const pattern = /\b(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]|require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  let match = pattern.exec(String(source || ""));

  while (match && imports.size < REVIEW_EVIDENCE_RELATED_FILE_LIMIT * 2) {
    imports.add(match[1] || match[2]);
    match = pattern.exec(String(source || ""));
  }

  return Array.from(imports);
}

function resolveRelativeImportCandidates(importerPath, specifier, repositoryFileSet) {
  const importerDirectory = getDirectoryName(importerPath);
  const basePath = normalizeRepositoryPath(`${importerDirectory ? `${importerDirectory}/` : ""}${specifier}`);
  const directCandidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.vue`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`
  ];

  return directCandidates.filter((candidate) => repositoryFileSet.has(candidate));
}

function normalizeChangePath(value) {
  return normalizeRepositoryPath(
    String(value || "")
      .replace(/\s+\([A-Z_]+\)$/i, "")
      .replace(/^["']|["']$/g, "")
  );
}

function normalizeRepositoryPath(path) {
  const parts = [];
  for (const part of String(path || "").replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function isReviewEvidenceFile(path) {
  const value = normalizeRepositoryPath(path);
  return (
    REVIEW_EVIDENCE_EXT_PATTERN.test(value) &&
    !/(^|\/)(dist|build|coverage|node_modules)(\/|$)/i.test(value) &&
    !REVIEW_EVIDENCE_TEST_FILE_PATTERN.test(value)
  );
}

function trimReviewEvidenceSource(source) {
  const text = String(source || "").trim();
  if (text.length <= REVIEW_EVIDENCE_SOURCE_CHAR_LIMIT) return text;
  return `${text.slice(0, REVIEW_EVIDENCE_SOURCE_CHAR_LIMIT)}\n...`;
}

function getDirectoryName(path) {
  const normalized = normalizeRepositoryPath(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex > 0 ? normalized.slice(0, slashIndex) : "";
}

function getBaseNameWithoutExtension(path) {
  const fileName = normalizeRepositoryPath(path).split("/").pop() || "";
  return fileName.replace(/\.[^.]+$/, "");
}

function encodeRepositoryPath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function formatRepositoryFilePayload(rawPayload, contentType) {
  if (!contentType.includes("json")) return rawPayload;

  try {
    const parsed = JSON.parse(rawPayload);
    if (Array.isArray(parsed?.lines)) {
      return parsed.lines.map((line) => line?.text ?? line?.line ?? "").join("\n");
    }
    return typeof parsed?.content === "string" ? parsed.content : rawPayload;
  } catch {
    return rawPayload;
  }
}

function trimComponentSource(source) {
  const text = String(source || "").trim();
  if (text.length <= COMPONENT_SOURCE_CHAR_LIMIT) return text;
  return `${text.slice(0, COMPONENT_SOURCE_CHAR_LIMIT)}\n...`;
}

function formatPullRequestInfo(pullRequest) {
  return {
    id: pullRequest?.id ?? null,
    title: String(pullRequest?.title || "").trim(),
    description: String(pullRequest?.description || "").trim(),
    state: String(pullRequest?.state || "").trim(),
    fromRef: pullRequest?.fromRef?.displayId || pullRequest?.fromRef?.id || "",
    toRef: pullRequest?.toRef?.displayId || pullRequest?.toRef?.id || "",
    authorName:
      pullRequest?.author?.user?.displayName ||
      pullRequest?.author?.user?.name ||
      pullRequest?.author?.displayName ||
      ""
  };
}

function formatCommit(commit) {
  return {
    id: commit?.id || "",
    displayId: commit?.displayId || String(commit?.id || "").slice(0, 12),
    message: String(commit?.message || "").trim(),
    authorName:
      commit?.author?.displayName ||
      commit?.author?.name ||
      commit?.authorTimestamp ||
      ""
  };
}

function formatChangePath(change) {
  const path =
    change?.path?.toString ||
    change?.path?.displayId ||
    change?.path?.components?.join("/") ||
    change?.srcPath?.toString ||
    change?.srcPath?.displayId;
  const type = change?.type ? ` (${change.type})` : "";
  return path ? `${path}${type}` : "";
}

function formatDiffPayload(rawPayload, contentType) {
  if (!contentType.includes("json")) {
    return rawPayload;
  }

  try {
    const parsed = JSON.parse(rawPayload);
    if (!Array.isArray(parsed.diffs)) {
      return JSON.stringify(parsed, null, 2);
    }

    return parsed.diffs.map(formatStructuredDiff).join("\n\n");
  } catch {
    return rawPayload;
  }
}

function formatStructuredDiff(diff) {
  const sourcePath = diff?.source?.toString || diff?.source?.displayId || "unknown";
  const destinationPath = diff?.destination?.toString || diff?.destination?.displayId || sourcePath;
  const lines = [`diff --git a/${sourcePath} b/${destinationPath}`];

  for (const hunk of diff.hunks || []) {
    lines.push(formatHunkHeader(hunk));

    for (const segment of hunk.segments || []) {
      const prefix = segment.type === "ADDED" ? "+" : segment.type === "REMOVED" ? "-" : " ";
      for (const line of segment.lines || []) {
        lines.push(`${prefix}${line.line ?? ""}`);
      }
    }
  }

  return lines.join("\n");
}

function formatHunkHeader(hunk) {
  const sourceLine = Number.isFinite(hunk?.sourceLine) ? hunk.sourceLine : 0;
  const sourceSpan = Number.isFinite(hunk?.sourceSpan) ? hunk.sourceSpan : 0;
  const destinationLine = Number.isFinite(hunk?.destinationLine) ? hunk.destinationLine : 0;
  const destinationSpan = Number.isFinite(hunk?.destinationSpan) ? hunk.destinationSpan : 0;
  return `@@ -${sourceLine},${sourceSpan} +${destinationLine},${destinationSpan} @@`;
}

async function formatHttpError(prefix, response) {
  const text = await response.text().catch(() => "");
  const preview = text ? ` ${text.slice(0, 300)}` : "";
  return `${prefix}: HTTP ${response.status}.${preview}`;
}
