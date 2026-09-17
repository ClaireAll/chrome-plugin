const assert = require("assert");
const crypto = require("crypto");

// 统一仓库相对路径，确保 Windows 与 Git 输出使用同一种格式。
function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

// 从 Git 文件头中提取仓库相对路径。
function parseHeaderPath(value) {
  const text = String(value || "").trim();
  if (!text || text === "/dev/null") return "";
  const withoutPrefix = text.replace(/^[ab]\//, "");
  return normalizePath(withoutPrefix.replace(/^"|"$/g, ""));
}

// 根据路径和 hunk 正文生成稳定标识，忽略会随前置改动漂移的行号。
function createHunkId(filePath, patch) {
  const body = String(patch || "")
    .split(/\r?\n/)
    .filter((line, index) => index > 0)
    .join("\n");
  return crypto
    .createHash("sha256")
    .update(`${normalizePath(filePath)}\0${body}`)
    .digest("hex")
    .slice(0, 20);
}

// 将单个 hunk 转成视图所需的结构。
function createHunk(filePath, header, lines, binary = false) {
  const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  const patch = [header, ...lines].join("\n");
  return {
    id: createHunkId(filePath, patch),
    path: normalizePath(filePath),
    patch,
    header,
    lines,
    binary,
    oldStart: match ? Number(match[1]) : 0,
    oldCount: match ? Number(match[2] || 1) : 0,
    newStart: match ? Number(match[3]) : 0,
    newCount: match ? Number(match[4] || 1) : 0
  };
}

// 解析 git diff 输出为按文件和 hunk 划分的列表。
function parseGitDiff(output) {
  const hunks = [];
  const lines = String(output || "").split(/\r?\n/);
  let oldPath = "";
  let newPath = "";
  let currentHeader = "";
  let currentLines = [];

  // 提交当前正在收集的 hunk。
  function finishHunk() {
    if (!currentHeader) return;
    const filePath = newPath || oldPath;
    if (filePath) hunks.push(createHunk(filePath, currentHeader, currentLines));
    currentHeader = "";
    currentLines = [];
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishHunk();
      oldPath = "";
      newPath = "";
      continue;
    }
    if (line.startsWith("--- ")) {
      oldPath = parseHeaderPath(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ")) {
      newPath = parseHeaderPath(line.slice(4));
      continue;
    }
    if (line.startsWith("@@ ")) {
      finishHunk();
      currentHeader = line;
      continue;
    }
    if (line.startsWith("Binary files ")) {
      finishHunk();
      const binaryMatch = line.match(/^Binary files (.+) and (.+) differ$/);
      if (binaryMatch) {
        oldPath = parseHeaderPath(binaryMatch[1]);
        newPath = parseHeaderPath(binaryMatch[2]);
      }
      const filePath = newPath || oldPath;
      if (filePath) hunks.push(createHunk(filePath, "@@ binary @@", [line], true));
      continue;
    }
    if (currentHeader && (
      line.startsWith(" ") ||
      line.startsWith("+") ||
      line.startsWith("-") ||
      line === "\\ No newline at end of file"
    )) {
      currentLines.push(line);
    }
  }

  finishHunk();
  return addHunkOccurrences(hunks);
}

// 为同一文件内正文完全相同的 hunk 添加出现序号，避免归组时互相覆盖。
function addHunkOccurrences(hunks) {
  const counts = new Map();
  for (const hunk of hunks) {
    const key = `${hunk.path}:${hunk.id}`;
    hunk.occurrence = counts.get(key) || 0;
    counts.set(key, hunk.occurrence + 1);
  }
  return hunks;
}

// 将未跟踪文本文件构造成一个完整的新增 hunk。
function createUntrackedHunk(filePath, content, binary = false) {
  if (binary) return { ...createHunk(filePath, "@@ binary @@", ["Binary file"], true), occurrence: 0 };
  const normalized = String(content).replace(/\r\n/g, "\n");
  const sourceLines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  const fileLines = normalized === "" ? [] : sourceLines;
  const count = fileLines.length;
  return {
    ...createHunk(filePath, `@@ -0,0 +1,${count} @@`, fileLines.map((line) => `+${line}`)),
    occurrence: 0
  };
}

// 为虚拟 Diff 分别生成修改前和修改后的片段文本。
function buildDiffDocuments(hunks) {
  const before = [];
  const after = [];
  let beforeHasFinalNewline = true;
  let afterHasFinalNewline = true;

  for (const [index, hunk] of hunks.entries()) {
    if (index > 0) {
      before.push("", "⋯", "");
      after.push("", "⋯", "");
    }
    if (hunk.binary) {
      before.push("Binary file before change");
      after.push("Binary file after change");
      continue;
    }
    for (const [lineIndex, line] of hunk.lines.entries()) {
      if (line.startsWith(" ")) {
        before.push(line.slice(1));
        after.push(line.slice(1));
      } else if (line.startsWith("-")) {
        before.push(line.slice(1));
      } else if (line.startsWith("+")) {
        after.push(line.slice(1));
      } else if (line === "\\ No newline at end of file") {
        const previousPrefix = hunk.lines[lineIndex - 1]?.charAt(0);
        if (previousPrefix === "-" || previousPrefix === " ") beforeHasFinalNewline = false;
        if (previousPrefix === "+" || previousPrefix === " ") afterHasFinalNewline = false;
      }
    }
  }

  return {
    before: before.length ? `${before.join("\n")}${beforeHasFinalNewline ? "\n" : ""}` : "",
    after: after.length ? `${after.join("\n")}${afterHasFinalNewline ? "\n" : ""}` : ""
  };
}

// 执行最小自检，覆盖解析、稳定标识和虚拟 Diff 生成。
function runSelfCheck() {
  const sample = [
    "diff --git a/src/a.js b/src/a.js",
    "--- a/src/a.js",
    "+++ b/src/a.js",
    "@@ -1,2 +1,2 @@",
    " const a = 1;",
    "-const b = 2;",
    "+const b = 3;"
  ].join("\n");
  const hunks = parseGitDiff(sample);
  assert.strictEqual(hunks.length, 1);
  assert.strictEqual(hunks[0].path, "src/a.js");
  assert.strictEqual(createHunkId("src/a.js", hunks[0].patch), hunks[0].id);
  assert.deepStrictEqual(buildDiffDocuments(hunks), {
    before: "const a = 1;\nconst b = 2;\n",
    after: "const a = 1;\nconst b = 3;\n"
  });

  const binary = parseGitDiff([
    "diff --git a/media/icon.png b/media/icon.png",
    "index 1111111..2222222 100644",
    "Binary files a/media/icon.png and b/media/icon.png differ"
  ].join("\n"));
  assert.strictEqual(binary.length, 1);
  assert.strictEqual(binary[0].path, "media/icon.png");
  assert.strictEqual(binary[0].binary, true);

  const eof = parseGitDiff([
    "diff --git a/a.txt b/a.txt",
    "--- a/a.txt",
    "+++ b/a.txt",
    "@@ -1 +1 @@",
    "-same",
    "\\ No newline at end of file",
    "+same"
  ].join("\n"));
  assert.deepStrictEqual(buildDiffDocuments(eof), {
    before: "same",
    after: "same\n"
  });
}

module.exports = {
  buildDiffDocuments,
  createHunkId,
  createUntrackedHunk,
  normalizePath,
  parseGitDiff,
  runSelfCheck
};
