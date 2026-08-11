# I18n Search Helper

VS Code 搜索辅助插件：输入中文文案后，从项目里的 `zh_CN.json` 找到对应 i18n key，并把搜索词切换为 key。

## 使用

1. 在 VS Code 打开项目。
2. 打开搜索面板。
3. 点击搜索面板标题栏里的 `I18n Search: Search Key in Files` 按钮。
4. 输入中文文案，例如 `创建表单`。
5. 选择匹配的 key 后，插件会打开 VS Code 全局搜索。

也可以在编辑器里选中文案后右键使用：

- `I18n Search: Search Key in Current File`
- `I18n Search: Search Key in Files`

快捷键：

- `Ctrl+Alt+I`：当前文件搜索 key。

## 配置

只有一个配置项：

```json
{
  "i18nSearchHelper.localeFile": "zh_CN.json"
}
```

如果只填写 `zh_CN.json`，插件会在当前 workspace 中自动查找，并把配置补全为类似下面的完整 workspace 相对路径：

```json
{
  "i18nSearchHelper.localeFile": "packages/jsy-web/i18n/zh_CN.json"
}
```

每个仓库可以拥有自己的配置。建议放在当前仓库的 `.vscode/settings.json`：

```json
{
  "i18nSearchHelper.localeFile": "packages/jsy-web/i18n/zh_CN.json"
}
```

## 验证

```bash
npm run check
```
