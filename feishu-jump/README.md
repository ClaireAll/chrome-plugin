# Feishu Task Jumper

A Chrome/Edge extension for opening a Feishu Project work item detail page from a key such as `f-7028807610` or `m-7040569864`.

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

Press Enter or click "打开". The extension opens `m-` keys as stories and `f-` keys as issues, removing the prefix before navigating to the detail page. A numeric key without a prefix continues to open as an issue.

You can also jump from the browser address bar:

1. Type `fs`, then press Space or Tab.
2. Enter the task number or key, for example `7028807610` or `m-7040569864`.
3. Choose the jump suggestion or press Enter.

## Development

Run tests:

```bash
npm test
```

Run syntax checks:

```bash
npm run check
```
