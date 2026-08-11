const fs = require("node:fs/promises");
const path = require("node:path");
const vscode = require("vscode");

const DEFAULT_LOCALE_FILE = "zh_CN.json";
const CONFIG_SECTION = "i18nSearchHelper";
const LOCALE_FILE_CONFIG = "localeFile";
const HAS_LAST_SEARCH_CONTEXT = "i18nSearchHelper.hasLastSearch";
const USING_KEY_SEARCH_CONTEXT = "i18nSearchHelper.usingKeySearch";
const SEARCH_EXCLUDE_GLOB = "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/.next/**,**/coverage/**}";

let lastSearchPair = null;

function activate(context) {
  void setSearchContexts(false, false);
  void completeLocaleFileSettingsIfExplicit();

  context.subscriptions.push(
    vscode.commands.registerCommand("i18nSearchHelper.searchInFiles", () => runI18nKeyAction("files")),
    vscode.commands.registerCommand("i18nSearchHelper.searchInEditor", () => runI18nKeyAction("editor")),
    vscode.commands.registerCommand("i18nSearchHelper.copyKey", () => runI18nKeyAction("copy")),
    vscode.commands.registerCommand("i18nSearchHelper.searchLastKey", searchLastKey),
    vscode.commands.registerCommand("i18nSearchHelper.searchOriginalText", searchOriginalText),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("i18nSearchHelper.localeFile")) {
        void completeLocaleFileSettingsIfExplicit();
      }
    })
  );
}

function deactivate() {}

async function runI18nKeyAction(action) {
  try {
    const target = action === "editor" ? "editor" : "files";
    const query = await getQueryText();
    if (!query) return;

    const locale = await loadLocaleEntries();
    const matches = findLocaleMatches(locale.entries, query);
    if (!matches.length) {
      vscode.window.showInformationMessage(`\u6ca1\u6709\u5728 ${locale.relativePath} \u4e2d\u627e\u5230\u300c${query}\u300d\u3002`);
      return;
    }

    const picked = await pickLocaleMatch(matches, query, locale.relativePath);
    if (!picked) return;

    await rememberLastSearchPair(query, picked.key, target, action !== "copy");

    if (action === "copy") {
      await vscode.env.clipboard.writeText(picked.key);
      vscode.window.showInformationMessage(`\u5df2\u590d\u5236 i18n key: ${picked.key}`);
      return;
    }

    await runSearch(target, picked.key);
  } catch (error) {
    vscode.window.showErrorMessage(error.message || String(error));
  }
}

async function searchLastKey() {
  if (!lastSearchPair) {
    await runI18nKeyAction("files");
    return;
  }

  await runSearch(lastSearchPair.target, lastSearchPair.key);
  await setSearchContexts(true, true);
}

async function searchOriginalText() {
  if (!lastSearchPair) {
    await runI18nKeyAction("files");
    return;
  }

  await runSearch(lastSearchPair.target, lastSearchPair.originalText);
  await setSearchContexts(true, false);
}

async function rememberLastSearchPair(originalText, key, target, usingKeySearch) {
  lastSearchPair = { originalText, key, target };
  await setSearchContexts(true, usingKeySearch);
}

async function setSearchContexts(hasLastSearch, usingKeySearch) {
  await vscode.commands.executeCommand("setContext", HAS_LAST_SEARCH_CONTEXT, hasLastSearch);
  await vscode.commands.executeCommand("setContext", USING_KEY_SEARCH_CONTEXT, usingKeySearch);
}

async function runSearch(target, searchText) {
  if (target === "editor") {
    await searchInCurrentEditor(searchText);
    return;
  }

  await searchInFiles(searchText);
}

async function getQueryText() {
  const selectionText = getSelectedText();
  const input = await vscode.window.showInputBox({
    title: "I18n Search",
    prompt: "\u8f93\u5165\u4e2d\u6587\u6587\u6848\uff0c\u4f8b\u5982\uff1a\u521b\u5efa\u8868\u5355",
    value: selectionText,
    valueSelection: selectionText ? [0, selectionText.length] : undefined,
    ignoreFocusOut: true
  });

  return String(input || "").trim();
}

function getSelectedText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return "";
  return editor.document.getText(editor.selection).trim();
}

async function loadLocaleEntries() {
  const workspaceFolder = getActiveWorkspaceFolder();
  const candidate = await resolveLocaleFileCandidate(workspaceFolder, true);

  try {
    const content = await fs.readFile(candidate.absolutePath, "utf8");
    const data = JSON.parse(content);
    return {
      relativePath: candidate.label,
      entries: flattenLocaleEntries(data)
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`\u6ca1\u6709\u627e\u5230 i18n \u6587\u4ef6\uff1a${candidate.label}`);
    }
    throw new Error(`\u8bfb\u53d6 i18n \u6587\u4ef6\u5931\u8d25\uff1a${candidate.label}\n${error.message || error}`);
  }
}

async function completeLocaleFileSettingsIfExplicit() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) {
    await completeLocaleFileSettingIfExplicit(null);
    return;
  }

  await Promise.all(folders.map((folder) => completeLocaleFileSettingIfExplicit(folder)));
}

async function completeLocaleFileSettingIfExplicit(workspaceFolder) {
  const config = getI18nConfig(workspaceFolder);
  const inspected = config.inspect(LOCALE_FILE_CONFIG);
  const explicitValue = inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;

  if (!explicitValue || hasPathSeparator(String(explicitValue)) || path.isAbsolute(String(explicitValue))) return;

  try {
    await resolveLocaleFileCandidate(workspaceFolder, true);
  } catch {
    // Do not surface configuration helper failures until the user runs a search.
  }
}

async function resolveLocaleFileCandidate(workspaceFolder, shouldUpdateSetting) {
  const config = getI18nConfig(workspaceFolder);
  const configSource = getLocaleFileConfigSource(config);
  const configured = String(config.get(LOCALE_FILE_CONFIG, DEFAULT_LOCALE_FILE) || DEFAULT_LOCALE_FILE).trim();

  const localReplacement = await findWorkspaceReplacementForSharedPath(configured, configSource, workspaceFolder);
  if (localReplacement) {
    if (shouldUpdateSetting) await updateLocaleFileSettingIfNeeded(config, configured, localReplacement, workspaceFolder, true);
    return localReplacement;
  }

  const directCandidates = getDirectLocaleCandidates(configured, workspaceFolder);
  const existingDirect = await findExistingCandidate(directCandidates);

  if (existingDirect) {
    if (shouldUpdateSetting) await updateLocaleFileSettingIfNeeded(config, configured, existingDirect, workspaceFolder);
    return existingDirect;
  }

  const found = await findBestWorkspaceLocaleFile(path.basename(configured), workspaceFolder);
  if (found) {
    if (shouldUpdateSetting) await updateLocaleFileSettingIfNeeded(config, configured, found, workspaceFolder);
    return found;
  }

  const checked = directCandidates.map((candidate) => candidate.label);
  if (path.basename(configured) !== configured) checked.push(`**/${path.basename(configured)}`);
  throw new Error(`\u6ca1\u6709\u627e\u5230 i18n \u6587\u4ef6\u3002\u5df2\u68c0\u67e5\uff1a${checked.join(", ") || configured}`);
}

function getActiveWorkspaceFolder() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) return folder;
  }

  return (vscode.workspace.workspaceFolders || [])[0] || null;
}

function getI18nConfig(workspaceFolder) {
  return vscode.workspace.getConfiguration(CONFIG_SECTION, workspaceFolder?.uri);
}

function getLocaleFileConfigSource(config) {
  const inspected = config.inspect(LOCALE_FILE_CONFIG);
  if (inspected?.workspaceFolderValue !== undefined) return "workspaceFolder";
  if (inspected?.workspaceValue !== undefined) return "workspace";
  if (inspected?.globalValue !== undefined) return "global";
  return "default";
}

async function findWorkspaceReplacementForSharedPath(configured, configSource, workspaceFolder) {
  if (!workspaceFolder || !["global", "workspace"].includes(configSource) || !hasPathSeparator(configured)) return null;
  if (!path.isAbsolute(configured)) return null;
  if (isPathInside(workspaceFolder.uri.fsPath, configured)) return null;

  return findBestWorkspaceLocaleFile(path.basename(configured), workspaceFolder);
}

function getDirectLocaleCandidates(configured, workspaceFolder) {
  if (path.isAbsolute(configured)) {
    return [{
      absolutePath: configured,
      label: configured,
      settingValue: configured
    }];
  }

  const roots = workspaceFolder ? [workspaceFolder] : (vscode.workspace.workspaceFolders || []);
  return roots.map((root) => {
    const absolutePath = path.join(root.uri.fsPath, configured);
    return {
      absolutePath,
      label: path.join(root.name, configured),
      settingValue: normalizeSettingPath(configured)
    };
  });
}

async function findExistingCandidate(candidates) {
  for (const candidate of candidates) {
    if (await fileExists(candidate.absolutePath)) return candidate;
  }
  return null;
}

async function findBestWorkspaceLocaleFile(fileName, workspaceFolder) {
  const roots = workspaceFolder ? [workspaceFolder] : (vscode.workspace.workspaceFolders || []);
  if (!fileName || !roots.length) return null;

  const pattern = `**/${escapeGlobSegment(fileName)}`;
  const matchesByRoot = await Promise.all(
    roots.map((root) => vscode.workspace.findFiles(new vscode.RelativePattern(root, pattern), SEARCH_EXCLUDE_GLOB, 50))
  );
  const matches = matchesByRoot.flat();
  if (!matches.length) return null;

  matches.sort(compareLocaleUris);
  const uri = matches[0];
  const matchedFolder = vscode.workspace.getWorkspaceFolder(uri);
  const relativePath = matchedFolder
    ? normalizeSettingPath(path.relative(matchedFolder.uri.fsPath, uri.fsPath))
    : uri.fsPath;

  return {
    absolutePath: uri.fsPath,
    label: matchedFolder ? path.join(matchedFolder.name, relativePath) : uri.fsPath,
    settingValue: relativePath
  };
}

function compareLocaleUris(left, right) {
  const leftScore = getLocaleUriScore(left);
  const rightScore = getLocaleUriScore(right);
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.fsPath.length !== right.fsPath.length) return left.fsPath.length - right.fsPath.length;
  return left.fsPath.localeCompare(right.fsPath);
}

function getLocaleUriScore(uri) {
  const value = normalizeSettingPath(uri.fsPath).toLowerCase();
  let score = 0;
  if (value.endsWith("/packages/jsy-web/i18n/zh_cn.json")) score += 1000;
  if (value.includes("/i18n/")) score += 500;
  if (value.includes("/locales/") || value.includes("/locale/")) score += 100;
  return score;
}

async function updateLocaleFileSettingIfNeeded(config, configured, candidate, workspaceFolder, forceUpdate) {
  if (!candidate.settingValue) return;
  if (!forceUpdate && normalizeSettingPath(configured) === normalizeSettingPath(candidate.settingValue)) return;

  const target = workspaceFolder
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Global;

  await config.update(LOCALE_FILE_CONFIG, candidate.settingValue, target);
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function hasPathSeparator(value) {
  return value.includes("/") || value.includes("\\");
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function escapeGlobSegment(value) {
  return value.replace(/[\\{}[\]*?]/g, "\\$&");
}

function normalizeSettingPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function flattenLocaleEntries(data, prefix = "") {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];

  return Object.entries(data).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenLocaleEntries(value, fullKey);
    }

    return [{
      key: fullKey,
      value: String(value ?? "")
    }];
  });
}

function findLocaleMatches(entries, query) {
  const normalizedQuery = normalizeText(query);
  const queryLooksLikeKey = /^[A-Z][A-Za-z0-9_-]+$/.test(query);
  const matches = [];

  for (const entry of entries) {
    const normalizedValue = normalizeText(entry.value);
    const normalizedKey = normalizeText(entry.key);
    let score = 0;

    if (queryLooksLikeKey && entry.key === query) score = 1000;
    else if (normalizedValue === normalizedQuery) score = 900;
    else if (normalizedValue.includes(normalizedQuery)) score = 700;
    else if (normalizedKey.includes(normalizedQuery)) score = 500;

    if (score > 0) matches.push({ ...entry, score });
  }

  return matches
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
    .slice(0, 40);
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, "");
}

async function pickLocaleMatch(matches, query, localePath) {
  if (matches.length === 1) return matches[0];

  return vscode.window.showQuickPick(
    matches.map((match) => ({
      label: match.key,
      description: match.value,
      detail: `\u4ece\u300c${query}\u300d\u5207\u6362\u4e3a key \u641c\u7d22 - ${localePath}`,
      match
    })),
    {
      title: "\u9009\u62e9\u8981\u641c\u7d22\u7684 i18n key",
      placeHolder: "\u9009\u62e9\u540e\u4f1a\u628a\u641c\u7d22\u8bcd\u5207\u6362\u4e3a key",
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: true
    }
  ).then((item) => item?.match);
}

async function searchInFiles(key) {
  await vscode.commands.executeCommand("workbench.action.findInFiles", {
    query: key,
    isRegex: false,
    triggerSearch: true
  });
}

async function searchInCurrentEditor(key) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await searchInFiles(key);
    return;
  }

  await vscode.commands.executeCommand("editor.actions.findWithArgs", {
    searchString: key,
    isRegex: false,
    matchWholeWord: false,
    isCaseSensitive: true
  });
}

module.exports = {
  activate,
  deactivate
};
