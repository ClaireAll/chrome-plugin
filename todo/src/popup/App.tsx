import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent } from "react";
import { ConfigProvider, Tabs, message } from "antd";
import type { InputRef } from "antd";
import { DEFAULT_COLOR_PRESETS, nextTodoColor, reorderTodoItems } from "../shared/domain.ts";
import { MESSAGE_TYPES } from "../shared/messages.ts";
import {
  pickCompletedJsonFile,
  pickCompletedConfigDirectory,
  requestCompletedFilePermission
} from "../shared/completed-file-store.ts";
import { MAX_COLOR_PRESETS } from "../shared/settings.ts";
import { CompletedPanel } from "./components/CompletedPanel";
import { PopupHeader } from "./components/PopupHeader";
import { SettingsPanel } from "./components/SettingsPanel";
import { TodoPanel } from "./components/TodoPanel";
import { sendMessage } from "./runtime";
import type {
  CompletedData,
  CompletedStatus,
  InputChangeEvent,
  InputKeyEvent,
  RuntimeResult,
  TodoDropPosition,
  TodoItem,
  TodoSettings
} from "./types";
import {
  DEFAULT_CONFIG_FILE_NAME,
  EMPTY_COMPLETED_DATA,
  getCompletedCounts,
  normalizePickerColor,
  randomColorPreset
} from "./utils";

function PopupApp() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 7,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
        }
      }}
    >
      <TodoPopup />
    </ConfigProvider>
  );
}

function TodoPopup() {
  const [messageApi, contextHolder] = message.useMessage();
  const [activeTab, setActiveTab] = useState("overview");
  const [activeColorTodoId, setActiveColorTodoId] = useState("");
  const [activeReminderTodoId, setActiveReminderTodoId] = useState("");
  const [completedData, setCompletedData] = useState<CompletedData>(EMPTY_COMPLETED_DATA);
  const [completedError, setCompletedError] = useState("");
  const [completedStatus, setCompletedStatus] = useState<CompletedStatus | null>(null);
  const [completedSearch, setCompletedSearch] = useState("");
  const [draggedTodoId, setDraggedTodoId] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [newTodoDraft, setNewTodoDraft] = useState<string | null>(null);
  const [editingTodoId, setEditingTodoId] = useState("");
  const [editingTodoText, setEditingTodoText] = useState("");
  const [settings, setSettings] = useState<TodoSettings>({
    colorPresets: DEFAULT_COLOR_PRESETS,
    defaultColor: DEFAULT_COLOR_PRESETS[0]
  });
  const newTodoInputRef = useRef<InputRef>(null);
  const editInputRef = useRef<InputRef>(null);
  const reorderQueue = useRef<Promise<void>>(Promise.resolve());

  const completedRecords = Array.isArray(completedData?.completed) ? completedData.completed : [];
  const counts = useMemo(() => getCompletedCounts(completedData), [completedData]);

  async function refreshCompletedData(): Promise<void> {
    const result = await sendMessage(MESSAGE_TYPES.READ_COMPLETED_DATA);
    if (!result.ok) {
      setCompletedData(EMPTY_COMPLETED_DATA);
      setCompletedError(result.message || "无法读取配置文件");
      return;
    }

    setCompletedData(result.data && Array.isArray(result.data.completed) ? result.data : EMPTY_COMPLETED_DATA);
    setCompletedError("");
    if (result.fileName) {
      setCompletedStatus((current) => ({
        ...(current || {}),
        fileName: result.fileName,
        directoryName: current?.directoryName || "",
        permission: current?.permission || "granted"
      }));
    }
  }

  async function refreshState({ includeCompletedStatus = true }: { includeCompletedStatus?: boolean } = {}): Promise<void> {
    const result = await sendMessage(
      MESSAGE_TYPES.GET_STATE,
      includeCompletedStatus ? {} : { includeCompletedStatus: false }
    );
    if (!result.ok) {
      messageApi.error(result.message || "无法读取待办状态");
      return;
    }
    setItems(Array.isArray(result.items) ? result.items : []);
    setSettings(result.settings || settings);
    if (includeCompletedStatus) {
      setCompletedStatus(result.completedStatus || null);
      await refreshCompletedData();
    }
  }

  useEffect(() => {
    void refreshState();
  }, []);

  useEffect(() => {
    const storage = globalThis.chrome?.storage?.onChanged;
    if (!storage) return undefined;
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== "local") return;
      if (changes.todoCompletedFileMeta) {
        void refreshState();
      } else if (changes.todoUnfinishedItems || changes.todoSettings) {
        void refreshState({ includeCompletedStatus: false });
      }
    };
    storage.addListener(listener);
    return () => storage.removeListener(listener);
  }, []);

  async function runTodoMutation(type: string, payload: Record<string, unknown>, fallbackMessage: string): Promise<boolean> {
    const result = await sendMessage(type, payload);
    if (!result.ok) {
      messageApi.error(result.message || fallbackMessage);
      return false;
    }
    if (Array.isArray(result.items)) setItems(result.items);
    return true;
  }

  function startNewTodo(): void {
    setActiveColorTodoId("");
    setActiveReminderTodoId("");
    if (newTodoDraft !== null) {
      newTodoInputRef.current?.focus();
      return;
    }
    setEditingTodoId("");
    setNewTodoDraft("");
  }

  async function commitNewTodo(): Promise<void> {
    const text = newTodoDraft?.trim() || "";
    if (!text) {
      setNewTodoDraft(null);
      return;
    }
    const result = await sendMessage(MESSAGE_TYPES.ADD_TODO, { text, position: "start" });
    if (!result.ok) {
      messageApi.error(result.message || "添加待办失败");
      return;
    }
    setNewTodoDraft(null);
    if (Array.isArray(result.items)) setItems(result.items);
  }

  function handleNewTodoKeyDown(event: InputKeyEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setNewTodoDraft(null);
    }
  }

  function startEditingTodo(item: TodoItem): void {
    setActiveColorTodoId("");
    setActiveReminderTodoId("");
    setEditingTodoId(item.id);
    setEditingTodoText(item.text);
  }

  function updateEditingTodo(event: InputChangeEvent): void {
    setEditingTodoText(event.target.value);
  }

  async function commitTodoEdit(item: TodoItem): Promise<void> {
    const text = editingTodoText.trim();
    setEditingTodoId("");
    setEditingTodoText("");
    if (!text) return;
    if (text !== item.text) {
      await runTodoMutation(MESSAGE_TYPES.UPDATE_TODO_TEXT, { id: item.id, text }, "待办更新失败");
    }
  }

  function handleTodoEditKeyDown(event: InputKeyEvent, _item: TodoItem): void {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingTodoId("");
      setEditingTodoText("");
    }
  }

  async function updateReminder(id: string, value: string): Promise<void> {
    if (!value) {
      const cleared = await runTodoMutation(MESSAGE_TYPES.CLEAR_TODO_REMINDER, { id }, "清除提醒失败");
      if (cleared) setActiveReminderTodoId("");
      return;
    }
    const reminderAt = new Date(value).toISOString();
    const updated = await runTodoMutation(MESSAGE_TYPES.UPDATE_TODO_REMINDER, { id, reminderAt }, "提醒设置失败");
    if (updated) setActiveReminderTodoId("");
  }

  async function selectTodoColor(id: string, color: string): Promise<void> {
    setActiveColorTodoId("");
    await runTodoMutation(MESSAGE_TYPES.UPDATE_TODO_COLOR, { id, color }, "任务颜色更新失败");
  }

  function openColorPopover(id: string): void {
    setActiveColorTodoId(id);
    setActiveReminderTodoId("");
  }

  function openReminderPopover(id: string): void {
    setActiveReminderTodoId(id);
    setActiveColorTodoId("");
  }

  async function moveTodo(sourceId: string, targetId: string, position: TodoDropPosition): Promise<void> {
    const nextItems = reorderTodoItems(items, sourceId, targetId, position);
    if (nextItems.map((item) => item.id).join("|") === items.map((item) => item.id).join("|")) return;
    setItems(nextItems);
    const persist = async (): Promise<void> => {
      const result = await sendMessage(MESSAGE_TYPES.REORDER_TODOS, { sourceId, targetId, position });
      if (!result.ok) {
        messageApi.error(result.message || "待办排序保存失败");
        await refreshState();
        return;
      }
      if (Array.isArray(result.items)) setItems(result.items);
    };
    reorderQueue.current = reorderQueue.current.then(persist, persist);
  }

  async function completeTodo(id: string): Promise<void> {
    setActiveColorTodoId("");
    setActiveReminderTodoId("");
    setEditingTodoId("");
    setEditingTodoText("");
    const completed = await runTodoMutation(
      MESSAGE_TYPES.COMPLETE_TODO,
      { id, completedAt: new Date().toISOString() },
      "完成待办失败"
    );
    if (completed) await refreshCompletedData();
  }

  async function deleteTodo(id: string): Promise<void> {
    setActiveColorTodoId("");
    setActiveReminderTodoId("");
    if (editingTodoId === id) {
      setEditingTodoId("");
      setEditingTodoText("");
    }
    await runTodoMutation(MESSAGE_TYPES.DELETE_TODO, { id }, "删除待办失败");
  }

  async function updateColorPreset(oldColor: string, nextColor: string): Promise<void> {
    const normalized = normalizePickerColor(nextColor);
    const colors = [...(settings.colorPresets || [])];
    const index = colors.indexOf(oldColor);
    if (index < 0 || colors.includes(normalized) && colors[index] !== normalized) return;
    colors[index] = normalized;
    const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { colorPresets: colors });
    if (!result.ok) {
      messageApi.error(result.message || "颜色预设更新失败");
      return;
    }
    setSettings(result.settings || { ...settings, colorPresets: colors });
  }

  async function addColorPreset(): Promise<void> {
    const colors = [...(settings.colorPresets || [])];
    if (colors.length >= MAX_COLOR_PRESETS) {
      messageApi.info(`最多设置 ${MAX_COLOR_PRESETS} 种颜色`);
      return;
    }
    let next = randomColorPreset();
    while (colors.includes(next)) next = randomColorPreset();
    const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { colorPresets: [...colors, next] });
    if (!result.ok) {
      messageApi.error(result.message || "颜色预设添加失败");
      return;
    }
    setSettings(result.settings || { ...settings, colorPresets: [...colors, next] });
  }

  async function deleteColorPreset(color: string): Promise<void> {
    const colors = [...(settings.colorPresets || [])];
    if (colors.length <= 1) {
      messageApi.warning("至少保留一种颜色");
      return;
    }
    const nextColors = colors.filter((item) => item !== color);
    const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { colorPresets: nextColors });
    if (!result.ok) {
      messageApi.error(result.message || "颜色预设删除失败");
      return;
    }
    setSettings(result.settings || { ...settings, colorPresets: nextColors });
  }

  async function updateCompletedText(event: FocusEvent<HTMLDivElement>, recordIndex: number): Promise<void> {
    const record = completedRecords[recordIndex];
    if (!record) return;
    const text = event.currentTarget.textContent?.trim() || "";
    if (!text) {
      event.currentTarget.textContent = record.text;
      return;
    }
    if (text === record.text) return;
    const result = await sendMessage(MESSAGE_TYPES.UPDATE_COMPLETED_RECORD, { recordIndex, text });
    if (!result.ok) {
      messageApi.error(result.message || "完成记录更新失败");
      return;
    }
    await refreshCompletedData();
  }

  async function deleteCompletedRecord(recordIndex: number): Promise<void> {
    const result = await sendMessage(MESSAGE_TYPES.DELETE_COMPLETED_RECORD, { recordIndex });
    if (!result.ok) {
      messageApi.error(result.message || "完成记录删除失败");
      return;
    }
    await refreshCompletedData();
  }

  async function handleFileAction(action: () => Promise<RuntimeResult>): Promise<void> {
    setFileBusy(true);
    try {
      const result = await action();
      if (!result?.ok && result?.reason === "picker_cancelled") return;
      if (!result?.ok) {
        setCompletedError(result?.message || "配置文件操作失败");
        messageApi.error(result?.message || "配置文件操作失败");
        return;
      }
      setCompletedError("");
      setCompletedStatus((current) => ({
        ...(current || {}),
        fileName: result.fileName || current?.fileName || DEFAULT_CONFIG_FILE_NAME,
        directoryName: Object.hasOwn(result, "directoryName") ? result.directoryName || "" : current?.directoryName || "",
        permission: result.permission || "granted"
      }));
      if (result.data) setCompletedData(result.data);
      await refreshCompletedData();
    } finally {
      setFileBusy(false);
    }
  }

  return (
    <>
      {contextHolder}
      <main className="popup-shell">
        <PopupHeader itemCount={items.length} weeklyCompleted={counts.week} />
        <Tabs
          className="popup-tabs"
          activeKey={activeTab}
          destroyOnHidden
          items={[
            {
              key: "overview",
              label: "待办",
              children: (
                <TodoPanel
                  activeColorTodoId={activeColorTodoId}
                  activeReminderTodoId={activeReminderTodoId}
                  colorPresets={settings.colorPresets}
                  counts={counts}
                  draggedTodoId={draggedTodoId}
                  draftColor={nextTodoColor(items, settings, "start")}
                  editInputRef={editInputRef}
                  editingTodoId={editingTodoId}
                  editingTodoText={editingTodoText}
                  items={items}
                  newTodoDraft={newTodoDraft}
                  newTodoInputRef={newTodoInputRef}
                  onColorOpen={openColorPopover}
                  onColorSelect={selectTodoColor}
                  onCompleteTodo={completeTodo}
                  onDeleteTodo={deleteTodo}
                  onDragEnd={() => setDraggedTodoId("")}
                  onDragStart={setDraggedTodoId}
                  onMoveTodo={moveTodo}
                  onReminderChange={updateReminder}
                  onReminderOpen={openReminderPopover}
                  onEditChange={updateEditingTodo}
                  onEditCommit={commitTodoEdit}
                  onEditKeyDown={handleTodoEditKeyDown}
                  onEditStart={startEditingTodo}
                  onNewTodoChange={(event: ChangeEvent<HTMLInputElement>) => setNewTodoDraft(event.target.value)}
                  onNewTodoCommit={commitNewTodo}
                  onNewTodoKeyDown={handleNewTodoKeyDown}
                  onStartNewTodo={startNewTodo}
                />
              )
            },
            {
              key: "completed",
              label: "已办",
              children: (
                <CompletedPanel
                  completedData={completedData}
                  completedError={completedError}
                  completedRecords={completedRecords}
                  completedSearch={completedSearch}
                  deleteCompletedRecord={deleteCompletedRecord}
                  onCompletedSearchChange={setCompletedSearch}
                  onUpdateCompletedText={updateCompletedText}
                />
              )
            },
            {
              key: "settings",
              label: "设置",
              children: (
                <SettingsPanel
                  completedStatus={completedStatus}
                  deleteColorPreset={deleteColorPreset}
                  fileBusy={fileBusy}
                  onAddColorPreset={addColorPreset}
                  onPickConfigDirectory={() => handleFileAction(() => pickCompletedConfigDirectory({ fileName: DEFAULT_CONFIG_FILE_NAME }))}
                  onPickConfigFile={() => handleFileAction(() => pickCompletedJsonFile())}
                  onRequestPermission={() => handleFileAction(() => requestCompletedFilePermission())}
                  onUpdateColorPreset={updateColorPreset}
                  settings={settings}
                />
              )
            }
          ]}
          onChange={(key) => {
            setActiveColorTodoId("");
            setActiveReminderTodoId("");
            setActiveTab(key);
          }}
          tabBarGutter={26}
        />
      </main>
    </>
  );
}

export default PopupApp;
