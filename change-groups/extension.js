const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  buildDiffDocuments,
  createHunkId,
  createUntrackedHunk,
  normalizePath,
  parseGitDiff
} = require("./git-diff");

const execFileAsync = promisify(execFile);
const DATA_FILE_NAME = "change-groups.json";
const EMPTY_STATE = Object.freeze({ version: 1, groups: [] });

// 激活插件并注册视图、命令和虚拟 Diff 文档。
async function activate(context) {
  const model = new ChangeGroupsModel();
  const provider = new ChangeGroupsTreeProvider(model);
  const diffProvider = new DiffContentProvider();

  context.subscriptions.push(
    provider,
    diffProvider,
    vscode.workspace.registerTextDocumentContentProvider("change-groups-before", diffProvider),
    vscode.workspace.registerTextDocumentContentProvider("change-groups-after", diffProvider),
    vscode.window.registerTreeDataProvider("changeGroups.view", provider),
    vscode.commands.registerCommand("changeGroups.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("changeGroups.createGroup", () => createGroup(model, provider)),
    vscode.commands.registerCommand("changeGroups.renameGroup", (item) => renameGroup(model, provider, item)),
    vscode.commands.registerCommand("changeGroups.deleteGroup", (item) => deleteGroup(model, provider, item)),
    vscode.commands.registerCommand("changeGroups.assignHunk", (item) => assignFile(model, provider, item)),
    vscode.commands.registerCommand("changeGroups.unassignHunk", (item) => unassignFile(model, provider, item)),
    vscode.commands.registerCommand("changeGroups.openFile", (item) => openFile(item)),
    vscode.commands.registerCommand("changeGroups.openDiff", (item) => openDiff(model, diffProvider, item))
  );

  await model.initialize(() => provider.scheduleRefresh());
  await provider.refresh();
}

// 释放插件资源；具体监听器由订阅对象自行清理。
function deactivate() {}

class ChangeGroupsModel {
  // 创建当前工作区的分组模型。
  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    this.repoRoot = "";
    this.gitDir = "";
    this.statePath = "";
    this.state = cloneState(EMPTY_STATE);
    this.hunks = [];
    this.dirty = false;
    this.error = "";
    this.lastValidState = cloneState(EMPTY_STATE);
    this.stateSource = "";
    this.operation = Promise.resolve();
    this.disposables = [];
  }

  // 查找 Git 仓库并启动工作区与协议文件监听。
  async initialize(onChange) {
    if (!this.workspaceRoot) {
      this.error = "请先打开一个 Git 工作区。";
      return;
    }

    try {
      this.repoRoot = (await this.runGit(["rev-parse", "--show-toplevel"], this.workspaceRoot)).trim();
      const gitDirOutput = (await this.runGit(["rev-parse", "--git-dir"], this.repoRoot)).trim();
      this.gitDir = path.isAbsolute(gitDirOutput)
        ? path.normalize(gitDirOutput)
        : path.resolve(this.repoRoot, gitDirOutput);
      this.statePath = path.join(this.gitDir, DATA_FILE_NAME);
    } catch {
      this.error = "当前工作区不是 Git 仓库。";
      return;
    }

    const pattern = new vscode.RelativePattern(this.repoRoot, "**/*");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(onChange);
    watcher.onDidChange(onChange);
    watcher.onDidDelete(onChange);
    this.disposables.push(watcher);

    fs.watchFile(this.statePath, { interval: 500 }, onChange);
    this.disposables.push({
      dispose: () => fs.unwatchFile(this.statePath, onChange)
    });
  }

  // 读取当前 Diff、协议文件并清理已经失效的 hunk 记录。
  async refresh() {
    return this.enqueue(() => this.refreshNow());
  }

  // 在串行事务内执行实际刷新。
  async refreshNow() {
    if (!this.repoRoot) return;

    try {
      this.hunks = await this.readCurrentHunks();
      this.dirty = await this.isWorktreeDirty();
      if (!this.dirty) {
        this.state = cloneState(EMPTY_STATE);
        this.lastValidState = cloneState(EMPTY_STATE);
        this.error = "";
        await fs.promises.rm(this.statePath, { force: true });
        this.stateSource = "";
        return;
      }

      const loaded = await this.readState();
      if (loaded) {
        this.state = loaded;
        this.lastValidState = cloneState(loaded);
        this.error = "";
      }

      if (!this.error) {
        const reconciled = reconcileState(this.state, this.hunks);
        if (JSON.stringify(reconciled) !== JSON.stringify(this.state)) {
          const written = await this.writeState(reconciled, this.stateSource);
          if (written) {
            this.state = reconciled;
            this.lastValidState = cloneState(reconciled);
          } else {
            const latest = await this.readState();
            if (latest) {
              this.state = latest;
              this.lastValidState = cloneState(latest);
            }
          }
        }
      }
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  // 读取跟踪文件和未跟踪文件的全部未提交 hunk。
  async readCurrentHunks() {
    const hasHead = await this.hasHead();
    const trackedDiff = hasHead
      ? await this.runGit([
        "-c",
        "core.quotepath=false",
        "diff",
        "--no-ext-diff",
        "--unified=3",
        "--no-color",
        "HEAD",
        "--"
      ])
      : "";

    const hunks = parseGitDiff(trackedDiff);
    const fileArgs = hasHead
      ? ["ls-files", "--others", "--exclude-standard", "-z"]
      : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
    const untrackedOutput = await this.runGit(fileArgs);
    const untrackedPaths = Array.from(new Set(untrackedOutput.split("\0").filter(Boolean)));

    for (const relativePath of untrackedPaths) {
      const normalized = normalizePath(relativePath);
      const absolutePath = path.join(this.repoRoot, relativePath);
      let stat;
      try {
        stat = await fs.promises.stat(absolutePath);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      if (stat.size > 2 * 1024 * 1024) {
        hunks.push(createUntrackedHunk(normalized, "", true));
        continue;
      }
      const buffer = await fs.promises.readFile(absolutePath);
      const binary = buffer.subarray(0, 8000).includes(0);
      hunks.push(createUntrackedHunk(normalized, binary ? "" : buffer.toString("utf8"), binary));
    }

    return hunks;
  }

  // 判断仓库是否已经存在 HEAD，仅在无首个提交时使用空树读取逻辑。
  async hasHead() {
    try {
      await this.runGit(["rev-parse", "--verify", "-q", "HEAD"]);
      return true;
    } catch (error) {
      if (Number(error?.code) === 1) return false;
      throw error;
    }
  }

  // 独立检查 Git 状态，避免把纯重命名或权限变化误判为工作区干净。
  async isWorktreeDirty() {
    const status = await this.runGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
    return status.length > 0;
  }

  // 读取并校验 AI 与人工共用的分组文件。
  async readState() {
    try {
      const content = await fs.promises.readFile(this.statePath, "utf8");
      this.stateSource = content;
      return normalizeState(JSON.parse(content));
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.stateSource = "";
        return cloneState(EMPTY_STATE);
      }
      this.state = cloneState(this.lastValidState);
      this.error = `分组文件无效：${errorMessage(error)}`;
      return undefined;
    }
  }

  // 原子写入分组文件，避免监听器读取到不完整 JSON。
  async writeState(state, expectedSource) {
    await fs.promises.mkdir(this.gitDir, { recursive: true });
    if (expectedSource !== undefined) {
      let currentSource = "";
      try {
        currentSource = await fs.promises.readFile(this.statePath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      if (currentSource !== expectedSource) return false;
    }

    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    const temporaryPath = `${this.statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, serialized, "utf8");
      await fs.promises.rename(temporaryPath, this.statePath);
      this.stateSource = serialized;
      return true;
    } finally {
      await fs.promises.rm(temporaryPath, { force: true });
    }
  }

  // 在最新有效状态上执行一次人工修改。
  async mutate(mutator) {
    return this.enqueue(async () => {
      await this.refreshNow();
      if (this.error) throw new Error(this.error);
      const next = cloneState(this.state);
      await mutator(next);
      const normalized = normalizeState(next);
      const written = await this.writeState(normalized, this.stateSource);
      if (!written) throw new Error("分组数据刚被其他操作更新，请重试。");
      this.state = normalized;
      this.lastValidState = cloneState(normalized);
    });
  }

  // 将刷新和人工操作串行执行，避免内部写入互相覆盖。
  enqueue(operation) {
    const result = this.operation.then(operation, operation);
    this.operation = result.catch(() => undefined);
    return result;
  }

  // 在指定目录执行 Git 命令并返回标准输出。
  async runGit(args, cwd = this.repoRoot) {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 15000,
      windowsHide: true
    });
    return stdout;
  }

  // 释放文件监听器。
  dispose() {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
  }
}

class ChangeGroupsTreeProvider {
  // 创建 Change Groups 树数据提供器。
  constructor(model) {
    this.model = model;
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
    this.refreshTimer = undefined;
  }

  // 返回节点自身的 VS Code 树项。
  getTreeItem(element) {
    return element;
  }

  // 根据节点类型生成其子节点。
  getChildren(element) {
    if (element?.kind === "group") {
      return createFileNodes(
        this.model.repoRoot,
        element.groupId,
        element.name,
        element.hunks,
        Boolean(element.groupId)
      );
    }
    if (element) return [];

    if (!this.model.repoRoot) return [new MessageTreeItem(this.model.error || "请先打开 Git 工作区。")];
    const roots = [];
    if (this.model.error) roots.push(new MessageTreeItem(this.model.error, true));
    if (!this.model.hunks.length) {
      roots.push(new MessageTreeItem(
        this.model.dirty ? "当前改动不包含可分组的文本 hunk。" : "暂无未提交改动。"
      ));
    }

    const currentByKey = new Map(this.model.hunks.map((hunk) => [hunkKey(hunk), hunk]));
    const assignedKeys = new Set();
    for (const group of this.model.state.groups) {
      const hunks = group.hunks
        .map((record) => currentByKey.get(recordKey(record)))
        .filter(Boolean);
      hunks.forEach((hunk) => assignedKeys.add(hunkKey(hunk)));
      roots.push(new GroupTreeItem(group.id, group.name, hunks));
    }

    const ungrouped = this.model.hunks.filter((hunk) => !assignedKeys.has(hunkKey(hunk)));
    if (ungrouped.length) roots.push(new GroupTreeItem("", "未分组", ungrouped, true));
    return roots;
  }

  // 立即重新读取数据并刷新树。
  async refresh() {
    await this.model.refresh();
    this.changeEmitter.fire(undefined);
  }

  // 合并短时间内连续的文件变更通知。
  scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 250);
  }

  // 释放刷新计时器、事件和模型资源。
  dispose() {
    clearTimeout(this.refreshTimer);
    this.changeEmitter.dispose();
    this.model.dispose();
  }
}

class DiffContentProvider {
  // 创建用于保存临时 Diff 文本的内容提供器。
  constructor() {
    this.documents = new Map();
  }

  // 创建一个带原文件扩展名的虚拟文档地址。
  createUri(side, relativePath, content) {
    const scheme = side === "before" ? "change-groups-before" : "change-groups-after";
    const token = crypto.randomUUID();
    const uri = vscode.Uri.from({ scheme, path: `/${normalizePath(relativePath)}`, query: token });
    this.documents.set(uri.toString(), content);
    while (this.documents.size > 100) {
      this.documents.delete(this.documents.keys().next().value);
    }
    return uri;
  }

  // 返回指定虚拟文档的文本内容。
  provideTextDocumentContent(uri) {
    return this.documents.get(uri.toString()) || "";
  }

  // 清理虚拟文档缓存。
  dispose() {
    this.documents.clear();
  }
}

class GroupTreeItem extends vscode.TreeItem {
  // 创建 Bug 分组或“未分组”节点。
  constructor(groupId, name, hunks, ungrouped = false) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.kind = "group";
    this.groupId = groupId;
    this.name = name;
    this.hunks = hunks;
    this.ungrouped = ungrouped;
    this.description = `${new Set(hunks.map((hunk) => hunk.path)).size} 个文件`;
    this.contextValue = ungrouped ? "changeGroups.ungrouped" : "changeGroups.group";
    this.iconPath = new vscode.ThemeIcon(ungrouped ? "inbox" : "folder");
  }
}

class FileTreeItem extends vscode.TreeItem {
  // 创建分组内的文件节点。
  constructor(repoRoot, groupId, groupName, relativePath, hunks, grouped) {
    super(relativePath, vscode.TreeItemCollapsibleState.None);
    this.kind = "file";
    this.groupId = groupId;
    this.groupName = groupName;
    this.relativePath = relativePath;
    this.hunks = hunks;
    this.grouped = grouped;
    this.contextValue = grouped ? "changeGroups.file.grouped" : "changeGroups.file.ungrouped";
    this.resourceUri = vscode.Uri.file(path.join(repoRoot, relativePath));
    this.command = {
      command: "changeGroups.openDiff",
      title: "打开分组 Diff",
      arguments: [this]
    };
  }
}

class MessageTreeItem extends vscode.TreeItem {
  // 创建空状态或错误提示节点。
  constructor(message, error = false) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.kind = "message";
    this.iconPath = new vscode.ThemeIcon(error ? "error" : "info");
  }
}

// 按文件路径归并一组 hunk，并创建文件树节点。
function createFileNodes(repoRoot, groupId, groupName, hunks, grouped) {
  const byFile = new Map();
  for (const hunk of hunks) {
    if (!byFile.has(hunk.path)) byFile.set(hunk.path, []);
    byFile.get(hunk.path).push(hunk);
  }
  return Array.from(byFile.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, fileHunks]) => new FileTreeItem(
      repoRoot,
      groupId,
      groupName,
      relativePath,
      fileHunks,
      grouped
    ));
}

// 新建一个空分组并返回其标识。
async function createGroup(model, provider, suggestedName = "") {
  const name = await vscode.window.showInputBox({
    title: "新建 Change Group",
    prompt: "输入 Bug 分组名称",
    value: suggestedName,
    validateInput: (value) => validateGroupName(value, model.state.groups)
  });
  if (!name) return undefined;

  const id = crypto.randomUUID();
  await runMutation(model, provider, (state) => {
    state.groups.push({ id, name: name.trim(), hunks: [] });
  });
  return id;
}

// 重命名指定分组。
async function renameGroup(model, provider, item) {
  if (!item?.groupId) return;
  const current = model.state.groups.find((group) => group.id === item.groupId);
  if (!current) return;
  const name = await vscode.window.showInputBox({
    title: "重命名 Change Group",
    value: current.name,
    validateInput: (value) => validateGroupName(value, model.state.groups, current.id)
  });
  if (!name || name.trim() === current.name) return;

  await runMutation(model, provider, (state) => {
    const group = state.groups.find((candidate) => candidate.id === item.groupId);
    if (group) group.name = name.trim();
  });
}

// 删除分组记录但保留所有代码改动。
async function deleteGroup(model, provider, item) {
  if (!item?.groupId) return;
  const group = model.state.groups.find((candidate) => candidate.id === item.groupId);
  if (!group) return;
  const answer = await vscode.window.showWarningMessage(
    `删除分组“${group.name}”？代码改动会保留并回到“未分组”。`,
    { modal: true },
    "删除分组"
  );
  if (answer !== "删除分组") return;

  await runMutation(model, provider, (state) => {
    state.groups = state.groups.filter((candidate) => candidate.id !== item.groupId);
  });
}

// 将文件节点下的全部 hunk 移入用户选择的分组。
async function assignFile(model, provider, item) {
  if (!item?.hunks?.length) return;
  let groupId;
  if (!model.state.groups.length) {
    groupId = await createGroup(model, provider);
  } else {
    const picked = await vscode.window.showQuickPick(
      model.state.groups.map((group) => ({ label: group.name, groupId: group.id })),
      { title: "选择目标分组", placeHolder: "将整个 Git hunk 移入分组" }
    );
    groupId = picked?.groupId;
  }
  if (!groupId) return;

  await runMutation(model, provider, (state) => {
    const group = state.groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    for (const hunk of item.hunks) {
      removeHunkFromState(state, hunk);
      group.hunks.push({
        path: hunk.path,
        patch: hunk.patch,
        occurrence: hunk.occurrence || 0
      });
    }
  });
}

// 将文件节点下的全部 hunk 移回“未分组”。
async function unassignFile(model, provider, item) {
  if (!item?.hunks?.length) return;
  await runMutation(model, provider, (state) => {
    for (const hunk of item.hunks) removeHunkFromState(state, hunk);
  });
}

// 打开仅包含当前节点 hunk 的左右虚拟 Diff。
async function openDiff(model, diffProvider, item) {
  if (!item?.hunks?.length) return;
  const documents = buildDiffDocuments(item.hunks);
  const beforeUri = diffProvider.createUri("before", item.relativePath, documents.before);
  const afterUri = diffProvider.createUri("after", item.relativePath, documents.after);
  const title = `${item.groupName || "未分组"} · ${item.relativePath}`;
  await vscode.commands.executeCommand("vscode.diff", beforeUri, afterUri, title, { preview: true });
}

// 在编辑器中打开文件节点对应的工作区文件。
async function openFile(item) {
  if (!item?.resourceUri) return;
  try {
    await vscode.commands.executeCommand("vscode.open", item.resourceUri);
  } catch (error) {
    vscode.window.showErrorMessage(`无法打开文件：${errorMessage(error)}`);
  }
}

// 执行人工状态修改并统一展示错误。
async function runMutation(model, provider, mutator) {
  try {
    await model.mutate(mutator);
    await provider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Change Groups 操作失败：${errorMessage(error)}`);
  }
}

// 校验分组名称非空且不与其他分组重复。
function validateGroupName(value, groups, ignoredId = "") {
  const name = String(value || "").trim();
  if (!name) return "分组名称不能为空。";
  if (groups.some((group) => group.id !== ignoredId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return "已存在同名分组。";
  }
  return undefined;
}

// 从所有分组中删除指定 hunk，保证一个 hunk 只有一个归属。
function removeHunkFromState(state, hunk) {
  const key = hunkKey(hunk);
  for (const group of state.groups) {
    group.hunks = group.hunks.filter((record) => recordKey(record) !== key);
  }
}

// 清理失效与重复记录，并让靠后的分组拥有重复 hunk。
function reconcileState(state, currentHunks) {
  const currentKeys = new Set(currentHunks.map(hunkKey));
  const ownerByKey = new Map();
  for (const group of state.groups) {
    for (const record of group.hunks) {
      const key = recordKey(record);
      if (currentKeys.has(key)) ownerByKey.set(key, group.id);
    }
  }

  return {
    version: 1,
    groups: state.groups.map((group) => {
      const seen = new Set();
      return {
        id: group.id,
        name: group.name,
        hunks: group.hunks.filter((record) => {
          const key = recordKey(record);
          if (ownerByKey.get(key) !== group.id || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      };
    })
  };
}

// 校验并规范化外部 AI 可写入的数据结构。
function normalizeState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.groups)) {
    throw new Error("必须包含 version: 1 和 groups 数组");
  }
  const ids = new Set();
  const names = new Set();
  const groups = value.groups.map((rawGroup) => {
    if (!rawGroup || typeof rawGroup !== "object") throw new Error("分组必须是对象");
    const id = String(rawGroup.id || "").trim();
    const name = String(rawGroup.name || "").trim();
    if (!id || !name) throw new Error("每个分组都必须包含 id 和 name");
    if (ids.has(id)) throw new Error(`分组 id 重复：${id}`);
    if (names.has(name.toLocaleLowerCase())) throw new Error(`分组名称重复：${name}`);
    ids.add(id);
    names.add(name.toLocaleLowerCase());
    if (!Array.isArray(rawGroup.hunks)) throw new Error(`分组“${name}”的 hunks 必须是数组`);

    const hunks = rawGroup.hunks.map((record) => {
      const relativePath = normalizePath(record?.path);
      const patch = typeof record?.patch === "string" ? record.patch.replace(/\r\n/g, "\n") : "";
      if (!relativePath || !patch.startsWith("@@ ")) {
        throw new Error(`分组“${name}”包含无效 hunk`);
      }
      const occurrence = Number.isInteger(record.occurrence) && record.occurrence >= 0
        ? record.occurrence
        : 0;
      return { path: relativePath, patch, occurrence };
    });
    return { id, name, hunks };
  });
  return { version: 1, groups };
}

// 深拷贝分组状态，避免命令直接修改当前快照。
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// 生成当前 hunk 的路径加内容键。
function hunkKey(hunk) {
  return `${normalizePath(hunk.path)}:${hunk.id}:${hunk.occurrence || 0}`;
}

// 生成协议记录的路径加内容键。
function recordKey(record) {
  return `${normalizePath(record.path)}:${createHunkId(record.path, record.patch)}:${record.occurrence || 0}`;
}

// 将未知错误转换为可展示的短消息。
function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

module.exports = {
  activate,
  deactivate,
  normalizeState,
  reconcileState
};
