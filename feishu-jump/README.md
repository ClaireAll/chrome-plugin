# Feishu Task Jumper

A Chrome/Edge extension for opening Feishu Project and Jira work items from a task key.

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on developer mode.
3. Choose "Load unpacked".
4. Select this folder: `/Users/gxm/chrome-plugin/feishu-jump`.

## Use

Enter a task key, for example:

```text
f-7028807610
```

Press Enter or click "打开". Supported keys use the same built-in destinations as `task-link`:

| Key | Destination |
| --- | --- |
| `f-123` | `https://project.feishu.cn/b2rl2h/issue/detail/123` |
| `m-123`, `123` | `https://project.feishu.cn/b2rl2h/story/detail/123` |
| `g-123` | `https://project.feishu.cn/b2rl2h/assignment/detail/123` |
| `s-123` | `https://project.feishu.cn/b2rl2h/s/detail/123` |
| `JSY-123`, `REPORT-123`, `KERNEL-123` | `https://work.fineres.com/browse/<KEY>` |

An optional leading `#` is accepted, as in `#m-123`. Prefixes are case-insensitive. Unsupported keys are rejected.
Without a prefix, a numeric key opens a story by default. Add a prefix to choose another type.

You can also jump from the browser address bar:

1. Type `fs`, then press Space or Tab.
2. Enter the task number or key, for example `7028807610`, `m-7040569864`, or `JSY-123`.
3. For a numeric key, press Enter to open a story or choose an issue (`f-`), assignment (`g-`), or `s-` suggestion. For a prefixed key, press Enter to open its matching type.

## Development

Run tests:

```bash
npm test
```

Run syntax checks:

```bash
npm run check
```
