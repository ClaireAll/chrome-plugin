# Change Groups

将当前 Git 仓库的未提交改动按 Bug 分组，并在 VS Code 的“源代码管理”面板中按组查看独立 Diff。

## 使用方式

1. 安装 `change-groups.vsix` 并重新加载 VS Code。
2. 在“源代码管理”面板展开 **Change Groups**。
3. 使用视图标题栏的 `+` 新建分组。
4. 右键“未分组”中的文件并选择“移动到分组…”，该文件下的全部变更块会一起移动。
5. 点击分组下的文件，查看只包含该组改动的 Diff。
6. 悬浮文件后点击“打开文件”图标，可直接打开工作区文件。

删除分组只会删除归组信息，其中的 hunk 会回到“未分组”，不会改动代码、暂存区或 Git 历史。

## 通用 AI 协议

分组数据位于当前仓库实际 Git 目录下的 `change-groups.json`。可通过以下命令获得路径：

```powershell
git rev-parse --git-dir
```

文件格式：

```json
{
  "version": 1,
  "groups": [
    {
      "id": "唯一标识",
      "name": "Bug 分组名称",
      "hunks": [
        {
          "path": "src/example.js",
          "patch": "@@ -1,3 +1,3 @@\n-old\n+new",
          "occurrence": 0
        }
      ]
    }
  ]
}
```

AI 操作约定：

- 修改前先读取现有文件，保留其他分组。
- `path` 使用仓库相对路径和 `/` 分隔符。
- `patch` 写入 `git diff HEAD --unified=3` 中完整的单个 hunk。
- 同一路径存在正文完全相同的多个 hunk 时，使用从 `0` 开始的 `occurrence` 区分；其他情况可省略。
- 未跟踪文本文件不会出现在 `git diff HEAD` 中：使用 `@@ -0,0 +1,N @@` 作为首行，并把文件的每一行加上 `+` 前缀；`N` 是文件行数。
- 未跟踪二进制文件使用 `@@ binary @@\nBinary file` 作为 `patch`。
- 一个 hunk 只保留在一个分组中；重新归组时从旧分组移除。
- 删除分组时只删除对应的 `groups` 元素。
- 使用临时文件加重命名的方式原子写入，避免插件读取到半截 JSON。
- 工作区没有未提交改动时，插件会自动删除该数据文件。

## 打包

```powershell
npm run package
```

该命令会覆盖当前目录中的 `change-groups.vsix`。
