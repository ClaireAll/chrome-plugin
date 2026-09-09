# API Rewriter

API Rewriter 是一个用于当前标签页接口调试的 Chrome Side Panel 插件。它通过 Chrome DevTools Protocol 按需记录和拦截 Fetch/XHR JSON 请求，支持手动修改请求或响应 Body，也支持把字段变化保存为可复用规则。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录 `api-rewriter`。
4. 点击扩展图标打开 Side Panel。

插件要求 Chrome 118 或更高版本，并需要 `debugger` 权限以暂停和改写当前标签页的网络请求。

## 使用

1. 打开 Side Panel 后开启“接口记录”总开关，再在当前页面触发接口。
2. 为目标接口开启“请求”或“响应”开关，再次触发接口。
3. 在 JSON 编辑器中修改 Body，然后选择“原样放行”或“应用并继续”。
4. 可将字段差异保存为自定义标题的自动规则，或将完整请求 Body 保存为快捷模板。
5. 不需要显示或改写的接口可在实时请求卡片中点击“过滤”。
6. 如需迁移或备份数据，可在 Side Panel 顶部导入或导出 `api-rewriter.json`。

“已保存”页面包含替换规则、请求体模板和接口过滤。规则可重命名、删除和启用；同一 `Method + 完整 URL + 方向` 下只能启用一条规则。请求体模板只会出现在相同接口的请求编辑器中。接口过滤按 `Method + 完整 URL` 完全匹配，命中后不会记录、显示、手动拦截或应用自动规则，可随时取消。

## 数据存储

规则、请求体模板和接口过滤默认保存在扩展的浏览器本地存储中，重新打开 Side Panel 无需文件授权。顶部的“导入 JSON”会在确认后用文件内容覆盖当前数据，“导出 JSON”用于迁移或备份。

```json
{
  "version": 2,
  "rules": [],
  "requestTemplates": [],
  "interfaceFilters": []
}
```

## 限制

- 仅处理当前标签页中的 Fetch/XHR JSON Body。
- 接口按请求方法和完整 URL 精确匹配，Query 参与匹配。
- 每次打开 Side Panel 时接口记录默认关闭；关闭总开关会停止新记录和所有改写，但保留当前列表。
- 单个 Body 超过 5 MB 时原样放行。
- 页面刷新、关闭标签页或关闭 Side Panel 后，临时开关状态会重置。
- Chrome 内部页面、非 JSON、空请求 Body 和无法读取的响应会安全跳过。
- 如果 DevTools 或其他调试工具占用了当前标签页，请关闭冲突工具后点击“重新连接”。

## 检查

```powershell
npm run check
```
