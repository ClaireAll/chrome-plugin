# Task Link

将飞书项目、JSY、REPORT 和 KERNEL 任务号标记为可点击链接，并用浏览器打开对应详情页。

支持的内置格式：

```text
f-123
m-123
g-123
s-123
JSY-123
REPORT-123
KERNEL-123
```

如果文本里写成 `#f-123`，插件会匹配并链接 `f-123` 这一段，其他类型同理。

URL 规则：

- `f-123` -> `https://project.feishu.cn/b2rl2h/issue/detail/123`
- `m-123` -> `https://project.feishu.cn/b2rl2h/story/detail/123`
- `g-123` -> `https://project.feishu.cn/b2rl2h/assignment/detail/123`
- `s-123` -> `https://project.feishu.cn/b2rl2h/s/detail/123`
- `JSY-123` -> `https://work.fineres.com/browse/JSY-123`
- `REPORT-123` -> `https://work.fineres.com/browse/REPORT-123`
- `KERNEL-123` -> `https://work.fineres.com/browse/KERNEL-123`

在编辑器里可通过 `Ctrl` 或 `Cmd` + 点击打开链接，也可以从 hover 中打开。如果当前行的 git blame commit message 中包含任务号，编辑器 hover 里也会额外显示对应任务链接。

插件同时会为 GitLens 写入 autolink 规则，让 GitLens hover 和 commit details 中的任务号直接显示为链接。对于 `donjayamanne.githistory` 的 File History 页面，插件会在启动时自动安装页面补丁，将 history 列表、底部详情和确认弹窗中的任务号替换为可点击链接。

## 自定义规则

可以在 VS Code 设置 JSON 中增加 `taskLink.customRules`：

```json
{
  "taskLink.customRules": [
    {
      "prefix": "x-",
      "url": "https://example.com/task/<num>"
    }
  ]
}
```

`prefix` 也兼容填写成 `x-xx`，插件会自动取 `x-` 作为前缀。`url` 支持 `<num>`、`<id>`、`<key>`、`{id}`、`{key}` 或 `xx` 作为占位；如果不写占位，插件会把编号拼到 URL 末尾。

更新 VSIX 后建议执行一次 `Developer: Reload Window`，让 GitLens 配置和 Git History 页面补丁重新加载。
