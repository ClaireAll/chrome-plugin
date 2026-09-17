const fs = require("fs");
const path = require("path");
const { runSelfCheck } = require("../git-diff");

// 校验插件清单中的关键文件和命令引用，避免生成不可安装的包。
function checkPackage() {
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const commands = new Set(manifest.contributes.commands.map((item) => item.command));
  const requiredCommands = [
    "changeGroups.createGroup",
    "changeGroups.refresh",
    "changeGroups.renameGroup",
    "changeGroups.deleteGroup",
    "changeGroups.assignHunk",
    "changeGroups.unassignHunk",
    "changeGroups.openFile",
    "changeGroups.openDiff"
  ];

  for (const command of requiredCommands) {
    if (!commands.has(command)) throw new Error(`缺少命令：${command}`);
  }

  for (const relativePath of [manifest.main, manifest.icon, "README.md"]) {
    if (!fs.existsSync(path.resolve(root, relativePath))) {
      throw new Error(`缺少打包文件：${relativePath}`);
    }
  }

  if (manifest.contributes.views.scm[0].id !== "changeGroups.view") {
    throw new Error("Change Groups 视图未注册到源代码管理面板");
  }

  const openFileCommand = manifest.contributes.commands.find(
    (item) => item.command === "changeGroups.openFile"
  );
  const openFileMenu = manifest.contributes.menus["view/item/context"].find(
    (item) => item.command === "changeGroups.openFile"
  );
  if (openFileCommand?.icon !== "$(go-to-file)" || openFileMenu?.group !== "inline@1") {
    throw new Error("打开文件命令未注册为文件行内操作");
  }

  runSelfCheck();
}

checkPackage();
