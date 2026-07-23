# todo

`todo` is a Chrome Manifest V3 extension with a floating global todo list and local JSON completed history.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `D:\Claire\chrome-plugin\todo`.

## Notes

- Unfinished todos are stored in `chrome.storage.local`.
- Completed records are written to a selected or newly created JSON file only when a todo is completed.
- Reminder notifications fire once only when Chrome is running and the alarm is handled on time.
