const vscode = require("vscode");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const CONFIG_SECTION = "taskLink";
const CUSTOM_RULES_SETTING = "customRules";
const DEFAULT_TASK_RULES = [
  {
    type: "f",
    prefix: "f-",
    urlTemplate: "https://project.feishu.cn/b2rl2h/issue/detail/<id>"
  },
  {
    type: "m",
    prefix: "m-",
    urlTemplate: "https://project.feishu.cn/b2rl2h/story/detail/<id>"
  },
  {
    type: "g",
    prefix: "g-",
    urlTemplate: "https://project.feishu.cn/b2rl2h/assignment/detail/<id>"
  },
  {
    type: "s",
    prefix: "s-",
    urlTemplate: "https://project.feishu.cn/b2rl2h/s/detail/<id>"
  },
  {
    type: "JSY",
    prefix: "JSY-",
    urlTemplate: "https://work.fineres.com/browse/JSY-<id>"
  },
  {
    type: "REPORT",
    prefix: "REPORT-",
    urlTemplate: "https://work.fineres.com/browse/REPORT-<id>"
  },
  {
    type: "KERNEL",
    prefix: "KERNEL-",
    urlTemplate: "https://work.fineres.com/browse/KERNEL-<id>"
  }
];
const TASK_DOCUMENT_SELECTOR = [
  { scheme: "file" },
  { scheme: "untitled" },
  { scheme: "git" },
  { scheme: "gitlens" },
  { scheme: "vscode-remote" }
];
const BLAME_HOVER_CACHE_LIMIT = 200;
const BLAME_HOVER_CACHE_TTL_MS = 30 * 1000;
const BLAME_HOVER_TIMEOUT_MS = 2500;
const DECORATION_REFRESH_DELAYS = [0, 50, 250];
const GIT_HISTORY_EXTENSION_ID = "donjayamanne.githistory";
const GIT_HISTORY_PATCH_START = "/* task-link-githistory:start */";
const GIT_HISTORY_PATCH_END = "/* task-link-githistory:end */";
const pendingDecorationTimers = new Set();
const blameHoverCache = new Map();

let textTaskDecorationType;
let taskRuleCache;
let taskPatternCache;

function activate(context) {
  void ensureGitLensAutolinks();
  void ensureGitHistoryPatch();

  textTaskDecorationType = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor("textLink.foreground"),
    textDecoration: "underline",
    cursor: "pointer"
  });

  context.subscriptions.push(
    textTaskDecorationType,
    vscode.languages.registerDocumentLinkProvider(TASK_DOCUMENT_SELECTOR, new TaskDocumentLinkProvider()),
    vscode.languages.registerHoverProvider(TASK_DOCUMENT_SELECTOR, new TaskHoverProvider()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) scheduleEditorDecorationUpdate(editor);
    }),
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      editors.forEach(scheduleEditorDecorationUpdate);
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      scheduleEditorDecorationUpdate(event.textEditor);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      vscode.window.visibleTextEditors
        .filter((editor) => editor.document === document)
        .forEach(scheduleEditorDecorationUpdate);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      vscode.window.visibleTextEditors
        .filter((editor) => editor.document === event.document)
        .forEach(scheduleEditorDecorationUpdate);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      vscode.window.visibleTextEditors
        .filter((editor) => editor.document === document)
        .forEach(scheduleEditorDecorationUpdate);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(`${CONFIG_SECTION}.${CUSTOM_RULES_SETTING}`)) return;

      clearTaskRuleCache();
      vscode.window.visibleTextEditors.forEach(scheduleEditorDecorationUpdate);
      void ensureGitLensAutolinks();
      void ensureGitHistoryPatch();
    }),
    {
      dispose() {
        for (const timer of pendingDecorationTimers) {
          clearTimeout(timer);
        }
        pendingDecorationTimers.clear();
      }
    }
  );

  vscode.window.visibleTextEditors.forEach(scheduleEditorDecorationUpdate);
}

function deactivate() {}

class TaskDocumentLinkProvider {
  provideDocumentLinks(document) {
    const links = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
      const line = document.lineAt(lineNumber);
      for (const task of findTasks(line.text)) {
        const range = new vscode.Range(lineNumber, task.index, lineNumber, task.end);
        const link = new vscode.DocumentLink(range, vscode.Uri.parse(task.url));
        link.tooltip = `Open ${task.key}`;
        links.push(link);
      }
    }

    return links;
  }
}

class TaskHoverProvider {
  async provideHover(document, position, token) {
    const line = document.lineAt(position.line);
    const lineTasks = findTasks(line.text);
    const pointedTask = lineTasks.find((task) => position.character >= task.index && position.character <= task.end);

    if (pointedTask) {
      return createHover([pointedTask], "Task Link");
    }

    const blameTasks = await findBlameTasks(document, position, token);
    if (blameTasks.length) {
      return createHover(blameTasks, "Task Link from commit");
    }

    return undefined;
  }
}

function scheduleEditorDecorationUpdate(editor) {
  for (const delay of DECORATION_REFRESH_DELAYS) {
    const timer = setTimeout(() => {
      pendingDecorationTimers.delete(timer);
      updateEditorDecorations(editor);
    }, delay);
    pendingDecorationTimers.add(timer);
  }
}

function updateEditorDecorations(editor) {
  if (!textTaskDecorationType) return;

  const ranges = [];
  for (const visibleRange of getDecorationRanges(editor)) {
    for (let lineNumber = visibleRange.start.line; lineNumber <= visibleRange.end.line; lineNumber += 1) {
      if (lineNumber < 0 || lineNumber >= editor.document.lineCount) continue;
      const line = editor.document.lineAt(lineNumber);
      for (const task of findTasks(line.text)) {
        ranges.push(new vscode.Range(lineNumber, task.index, lineNumber, task.end));
      }
    }
  }

  editor.setDecorations(textTaskDecorationType, ranges);
}

function getDecorationRanges(editor) {
  if (editor.visibleRanges.length) return editor.visibleRanges;

  const activeLine = editor.selection?.active?.line || 0;
  return [new vscode.Range(
    Math.max(activeLine - 80, 0),
    0,
    Math.min(activeLine + 200, Math.max(editor.document.lineCount - 1, 0)),
    0
  )];
}

function findTasks(text) {
  const rules = getEffectiveTaskRules();
  const pattern = getTaskPattern(rules);
  const tasks = [];
  pattern.lastIndex = 0;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[2];
    const rule = findRuleForKey(key, rules);
    if (!rule) continue;

    const id = key.slice(rule.prefix.length);
    const hashOffset = text.charAt(match.index + match[1].length) === "#" ? 1 : 0;
    const index = match.index + match[1].length + hashOffset;

    tasks.push({
      key,
      type: rule.type,
      id,
      index,
      end: index + key.length,
      url: buildTaskUrl(rule, id, key)
    });
  }

  return tasks;
}

function getEffectiveTaskRules() {
  if (taskRuleCache) return taskRuleCache;

  const rulesByPrefix = new Map();
  for (const rule of DEFAULT_TASK_RULES) {
    rulesByPrefix.set(rule.prefix, rule);
  }

  for (const rule of readCustomTaskRules()) {
    rulesByPrefix.set(rule.prefix, rule);
  }

  taskRuleCache = Array.from(rulesByPrefix.values())
    .sort((left, right) => right.prefix.length - left.prefix.length || left.prefix.localeCompare(right.prefix));

  return taskRuleCache;
}

function readCustomTaskRules() {
  let configuredRules;
  try {
    configuredRules = vscode.workspace.getConfiguration(CONFIG_SECTION).get(CUSTOM_RULES_SETTING, []);
  } catch {
    return [];
  }

  if (!Array.isArray(configuredRules)) return [];

  return configuredRules
    .map((rule, index) => normalizeCustomTaskRule(rule, index))
    .filter(Boolean);
}

function normalizeCustomTaskRule(rule, index) {
  if (!rule || typeof rule !== "object") return undefined;

  const prefix = normalizeRulePrefix(rule.prefix || rule.pattern);
  const rawUrlTemplate = typeof rule.url === "string" ? rule.url : rule.urlTemplate;
  const urlTemplate = typeof rawUrlTemplate === "string" ? rawUrlTemplate.trim() : "";
  if (!prefix || !urlTemplate) return undefined;

  return {
    type: `custom-${index}`,
    prefix,
    urlTemplate
  };
}

function normalizeRulePrefix(prefix) {
  if (typeof prefix !== "string") return "";

  return prefix
    .trim()
    .replace(/^#/, "")
    .replace(/(?:<num>|<id>|\{id\}|xx)$/i, "");
}

function getTaskPattern(rules) {
  const signature = rules.map((rule) => rule.prefix).join("\n");
  if (taskPatternCache && taskPatternCache.signature === signature) {
    return taskPatternCache.pattern;
  }

  const alternatives = rules.map((rule) => `${escapeRegExp(rule.prefix)}\\d+`);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])#?(${alternatives.join("|")})(?![A-Za-z0-9_-])`, "g");
  taskPatternCache = {
    signature,
    pattern
  };
  return pattern;
}

function findRuleForKey(key, rules = getEffectiveTaskRules()) {
  return rules.find((rule) => key.startsWith(rule.prefix));
}

function buildTaskUrl(typeOrRule, id, key) {
  const rule = typeof typeOrRule === "object" ? typeOrRule : findRuleForType(typeOrRule);
  if (!rule) {
    throw new Error(`Unsupported task type: ${typeOrRule}`);
  }

  return applyUrlTemplate(rule.urlTemplate, id, key || `${rule.prefix}${id}`);
}

function findRuleForType(type) {
  return getEffectiveTaskRules().find((rule) => rule.type === type || rule.prefix.replace(/-$/, "") === type);
}

function applyUrlTemplate(urlTemplate, id, key) {
  const encodedId = encodeURIComponent(id);
  const encodedKey = encodeURIComponent(key);
  let url = String(urlTemplate);
  let replaced = false;

  url = url.replace(/<num>|<id>|\{num\}|\{id\}/g, () => {
    replaced = true;
    return encodedId;
  });
  url = url.replace(/<key>|\{key\}/g, () => {
    replaced = true;
    return encodedKey;
  });

  if (replaced) return url;
  if (url.includes("xx")) return url.replace(/xx/g, encodedId);
  return `${url}${encodedId}`;
}

function clearTaskRuleCache() {
  taskRuleCache = undefined;
  taskPatternCache = undefined;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findBlameTasks(document, position, token) {
  if (token?.isCancellationRequested) return [];
  if (document.uri.scheme !== "file" || !document.uri.fsPath) return [];

  const cacheKey = `${document.uri.toString()}:${document.version}:${position.line}`;
  const cached = blameHoverCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < BLAME_HOVER_CACHE_TTL_MS) {
    return cached.tasks;
  }

  try {
    const cwd = getBlameWorkingDirectory(document);
    const lineNumber = position.line + 1;
    const { stdout } = await execFileAsync(
      "git",
      ["-C", cwd, "blame", "--porcelain", "-L", `${lineNumber},${lineNumber}`, "--", document.uri.fsPath],
      {
        maxBuffer: 1024 * 1024,
        timeout: BLAME_HOVER_TIMEOUT_MS,
        windowsHide: true
      }
    );

    if (token?.isCancellationRequested) return [];

    const summary = parseGitBlameSummary(stdout);
    const tasks = summary ? findTasks(summary) : [];
    setBlameHoverCache(cacheKey, tasks);
    return tasks;
  } catch {
    setBlameHoverCache(cacheKey, []);
    return [];
  }
}

function getBlameWorkingDirectory(document) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (workspaceFolder?.uri?.scheme === "file") {
    return workspaceFolder.uri.fsPath;
  }

  return path.dirname(document.uri.fsPath);
}

function parseGitBlameSummary(output) {
  const summaryLine = String(output).split(/\r?\n/).find((line) => line.startsWith("summary "));
  if (!summaryLine) return "";

  return summaryLine.slice("summary ".length);
}

function setBlameHoverCache(key, tasks) {
  blameHoverCache.set(key, {
    createdAt: Date.now(),
    tasks
  });

  while (blameHoverCache.size > BLAME_HOVER_CACHE_LIMIT) {
    const oldestKey = blameHoverCache.keys().next().value;
    blameHoverCache.delete(oldestKey);
  }
}

async function ensureGitLensAutolinks() {
  const config = vscode.workspace.getConfiguration("gitlens");
  const existingAutolinks = config.get("autolinks");
  const nextAutolinks = mergeGitLensAutolinks(existingAutolinks, getGitLensAutolinks());

  try {
    if (!areAutolinksEqual(existingAutolinks, nextAutolinks)) {
      await config.update("autolinks", nextAutolinks, vscode.ConfigurationTarget.Global);
    }

    if (config.get("hovers.autolinks.enabled") !== true) {
      await config.update("hovers.autolinks.enabled", true, vscode.ConfigurationTarget.Global);
    }

    if (config.get("views.commitDetails.autolinks.enabled") !== true) {
      await config.update("views.commitDetails.autolinks.enabled", true, vscode.ConfigurationTarget.Global);
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showWarningMessage(`Task Link 无法自动更新 GitLens 链接配置：${message}`);
  }
}

function getGitLensAutolinks() {
  return getEffectiveTaskRules().flatMap((rule) => {
    const url = applyGitLensUrlTemplate(rule.urlTemplate, rule.prefix);
    return [
      {
        prefix: `#${rule.prefix}`,
        url
      },
      {
        prefix: rule.prefix,
        url
      }
    ];
  });
}

function applyGitLensUrlTemplate(urlTemplate, prefix) {
  let url = String(urlTemplate);
  let replaced = false;

  url = url.replace(/<num>|<id>|\{num\}|\{id\}/g, () => {
    replaced = true;
    return "<num>";
  });
  url = url.replace(/<key>|\{key\}/g, () => {
    replaced = true;
    return `${prefix}<num>`;
  });

  if (replaced) return url;
  if (url.includes("xx")) return url.replace(/xx/g, "<num>");
  return `${url}<num>`;
}

async function ensureGitHistoryPatch() {
  const gitHistory = vscode.extensions.getExtension(GIT_HISTORY_EXTENSION_ID);
  if (!gitHistory) return false;

  const bundlePath = path.join(gitHistory.extensionPath, "dist", "browser", "bundle.js");
  if (!fs.existsSync(bundlePath)) return false;

  try {
    const original = await fs.promises.readFile(bundlePath, "utf8");
    const next = applyGeneratedBlock(original, createGitHistoryPatchScript(getEffectiveTaskRules()));
    if (!next.changed) return false;

    await fs.promises.writeFile(bundlePath, next.content, "utf8");
    vscode.window.showInformationMessage("Task Link 已更新 Git History 链接补丁，Reload Window 后生效。");
    return true;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showWarningMessage(`Task Link 无法更新 Git History 链接补丁：${message}`);
    return false;
  }
}

function applyGeneratedBlock(content, block) {
  const start = content.indexOf(GIT_HISTORY_PATCH_START);
  const end = content.indexOf(GIT_HISTORY_PATCH_END);

  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + GIT_HISTORY_PATCH_END.length;
    const nextContent = `${content.slice(0, start)}${block}${content.slice(afterEnd)}`;
    return {
      content: nextContent,
      changed: nextContent !== content
    };
  }

  if (start !== -1 || end !== -1) {
    const withoutBrokenStart = content.replace(GIT_HISTORY_PATCH_START, "");
    const withoutBrokenMarker = withoutBrokenStart.replace(GIT_HISTORY_PATCH_END, "");
    const nextContent = `${withoutBrokenMarker.trimEnd()}\n\n${block}\n`;
    return {
      content: nextContent,
      changed: true
    };
  }

  const nextContent = `${content.trimEnd()}\n\n${block}\n`;
  return {
    content: nextContent,
    changed: true
  };
}

function createGitHistoryPatchScript(rules = getEffectiveTaskRules()) {
  const browserRules = rules.map((rule) => ({
    prefix: rule.prefix,
    urlTemplate: rule.urlTemplate
  }));

  return `${GIT_HISTORY_PATCH_START}
(function () {
  if (window.__taskLinkGitHistoryInstalled) return;
  window.__taskLinkGitHistoryInstalled = true;

  var selectors = [
    ".log-entry .commit-subject",
    "#detail-view .commit-subject",
    "#detail-view .commit-body",
    "#detail-view .commit-notes",
    ".modal-title",
    ".modal-body"
  ];
  var selector = selectors.join(",");
  var taskRules = ${JSON.stringify(browserRules)};
  var taskPattern = new RegExp("(^|[^A-Za-z0-9_])#?(" + taskRules.map(function (rule) {
    return escapeRegExp(rule.prefix) + "\\\\d+";
  }).join("|") + ")(?![A-Za-z0-9_-])", "g");

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, "\\\\$&");
  }

  function findRuleForKey(key) {
    return taskRules.find(function (rule) {
      return key.indexOf(rule.prefix) === 0;
    });
  }

  function buildTaskUrl(rule, id, key) {
    var encodedId = encodeURIComponent(id);
    var encodedKey = encodeURIComponent(key);
    var url = String(rule.urlTemplate);
    var replaced = false;

    url = url.replace(/<num>|<id>|\\{num\\}|\\{id\\}/g, function () {
      replaced = true;
      return encodedId;
    });
    url = url.replace(/<key>|\\{key\\}/g, function () {
      replaced = true;
      return encodedKey;
    });

    if (replaced) return url;
    if (url.indexOf("xx") !== -1) return url.replace(/xx/g, encodedId);
    return url + encodedId;
  }

  function createLink(label, rule, id) {
    var anchor = document.createElement("a");
    anchor.className = "task-link-githistory-link";
    anchor.href = buildTaskUrl(rule, id, label);
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.title = "Open " + label;
    anchor.textContent = label;
    anchor.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    return anchor;
  }

  function linkifyTextNode(node) {
    var text = node.nodeValue;
    if (!text) return;

    taskPattern.lastIndex = 0;
    var fragment;
    var lastIndex = 0;
    var match;

    while ((match = taskPattern.exec(text)) !== null) {
      var label = match[2];
      var rule = findRuleForKey(label);
      if (!rule) continue;

      var id = label.slice(rule.prefix.length);
      var hashOffset = text.charAt(match.index + match[1].length) === "#" ? 1 : 0;
      var index = match.index + match[1].length + hashOffset;

      if (!fragment) fragment = document.createDocumentFragment();
      if (index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
      fragment.appendChild(createLink(label, rule, id));
      lastIndex = index + label.length;
    }

    if (!fragment) return;
    if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.parentNode.replaceChild(fragment, node);
  }

  function shouldSkipTextNode(node) {
    var parent = node.parentElement;
    return !parent || !!parent.closest("a,button,input,textarea,select,svg,.task-link-githistory-link");
  }

  function linkifyElement(element) {
    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(linkifyTextNode);
  }

  function linkifyAll(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    var targets = [];
    if (root.matches && root.matches(selector)) targets.push(root);
    root.querySelectorAll(selector).forEach(function (element) {
      targets.push(element);
    });
    targets.forEach(linkifyElement);
  }

  function ensureStyle() {
    if (document.getElementById("task-link-githistory-style")) return;
    var style = document.createElement("style");
    style.id = "task-link-githistory-style";
    style.textContent = ".task-link-githistory-link{color:var(--vscode-textLink-foreground,#3794ff);text-decoration:underline;cursor:pointer}.task-link-githistory-link:hover{color:var(--vscode-textLink-activeForeground,#4daafc)}";
    document.head.appendChild(style);
  }

  function start() {
    ensureStyle();
    var scheduled = false;
    var schedule = function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        linkifyAll(document.body);
      }, 80);
    };
    schedule();
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
${GIT_HISTORY_PATCH_END}`;
}

function mergeGitLensAutolinks(existingAutolinks, requiredAutolinks) {
  const merged = Array.isArray(existingAutolinks) ? existingAutolinks.slice() : [];

  for (const required of requiredAutolinks) {
    const index = merged.findIndex((item) => item && item.prefix === required.prefix);

    if (index === -1) {
      merged.push(required);
      continue;
    }

    if (merged[index].url !== required.url) {
      merged[index] = { ...merged[index], ...required };
    }
  }

  return merged;
}

function areAutolinksEqual(left, right) {
  return JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : []);
}

function createHover(tasks, title) {
  return new vscode.Hover(createHoverMarkdown(tasks, title));
}

function createHoverMarkdown(tasks, title) {
  const uniqueTasks = dedupeTasks(tasks);
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.supportHtml = false;

  markdown.appendMarkdown(`**${escapeMarkdown(title)}**\n\n`);
  for (const task of uniqueTasks) {
    markdown.appendMarkdown(`[${
      escapeMarkdown(task.key)
    }](${task.url})\n\n`);
  }

  return markdown;
}

function dedupeTasks(tasks) {
  const seen = new Set();
  const uniqueTasks = [];

  for (const task of tasks) {
    const key = `${task.key}:${task.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTasks.push(task);
  }

  return uniqueTasks;
}

function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
}

module.exports = {
  activate,
  deactivate,
  applyGeneratedBlock,
  buildTaskUrl,
  createGitHistoryPatchScript,
  findTasks,
  parseGitBlameSummary,
  mergeGitLensAutolinks
};
