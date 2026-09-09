import CloseOutlined from "@ant-design/icons/CloseOutlined";
import FileTextOutlined from "@ant-design/icons/FileTextOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Button, Tag } from "antd";
import { DEFAULT_COLOR_PRESETS } from "../../shared/domain.ts";
import { MAX_COLOR_PRESETS } from "../../shared/settings.ts";
import type { CompletedStatus, InputChangeEvent, TodoSettings } from "../types";
import { DEFAULT_CONFIG_FILE_NAME, normalizePickerColor } from "../utils";

type SettingsPanelProps = {
  completedStatus: CompletedStatus | null;
  deleteColorPreset: (color: string) => void | Promise<void>;
  fileBusy: boolean;
  onAddColorPreset: () => void | Promise<void>;
  onPickConfigDirectory: () => void | Promise<void>;
  onPickConfigFile: () => void | Promise<void>;
  onRequestPermission: () => void | Promise<void>;
  onUpdateColorPreset: (oldColor: string, nextColor: string) => void | Promise<void>;
  settings: TodoSettings;
};

export function SettingsPanel({
  completedStatus,
  deleteColorPreset,
  fileBusy,
  onAddColorPreset,
  onPickConfigDirectory,
  onPickConfigFile,
  onRequestPermission,
  onUpdateColorPreset,
  settings
}: SettingsPanelProps) {
  const directoryName = completedStatus?.directoryName || "";
  const fileName = completedStatus?.fileName || "";
  const permission = completedStatus?.permission || "missing";
  const isReady = Boolean(fileName && permission === "granted");
  const statusLabel = isReady ? "已连接" : fileName ? permission === "denied" ? "需授权" : "待授权" : "未绑定";
  const statusClass = isReady ? "is-ready" : fileName ? "is-error" : "";
  const pathLabel = directoryName ? `${directoryName}/` : fileName ? `已绑定文件：${fileName}` : "尚未选择";
  const hint = directoryName
    ? `已自动创建 ${fileName || DEFAULT_CONFIG_FILE_NAME}`
    : fileName
      ? `当前文件：${fileName}`
      : `选择一个目录后，程序会自动创建 ${DEFAULT_CONFIG_FILE_NAME}。`;
  const colors = Array.isArray(settings.colorPresets) && settings.colorPresets.length ? settings.colorPresets : DEFAULT_COLOR_PRESETS;

  return (
    <section className="tab-panel settings-panel">
      <div className="settings-scroll">
        <section className="settings-section settings-section--file">
          <div className="settings-section-heading">
            <div>
              <h2>配置文件</h2>
              <p className="section-description">完成记录保存位置</p>
            </div>
            <Tag className={`status-pill ${statusClass}`}>{statusLabel}</Tag>
          </div>
          <div className="file-card">
            <span className="file-icon" aria-hidden="true"><FileTextOutlined /></span>
            <div className="file-card-copy">
              <span className="file-card-label">配置目录</span>
              <code title={directoryName ? `配置文件：${directoryName}/${fileName || DEFAULT_CONFIG_FILE_NAME}` : pathLabel}>{pathLabel}</code>
            </div>
          </div>
          <p className="field-hint">{hint}</p>
          <div className="button-row">
            <Button className="secondary-button" disabled={fileBusy} onClick={onPickConfigDirectory}>选择配置目录</Button>
            <Button className="secondary-button" disabled={fileBusy} onClick={onPickConfigFile}>导入已有配置文件</Button>
            <Button className="text-button" disabled={!fileName || fileBusy} loading={fileBusy} onClick={onRequestPermission}>请求权限</Button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading compact-heading">
            <div>
              <h2>任务颜色</h2>
              <p className="section-description">新任务按列表顺序循环取色</p>
            </div>
          </div>
          <div className="color-preset-list">
            {colors.map((color) => {
              const normalized = normalizePickerColor(color);
              return (
                <div className="color-preset-item" key={normalized}>
                  <input
                    aria-label={`编辑颜色 ${normalized}`}
                    className="color-preset-input"
                    title={`编辑 ${normalized}`}
                    type="color"
                    value={normalized}
                    onChange={(event: InputChangeEvent) => onUpdateColorPreset(normalized, event.target.value)}
                  />
                  <Button
                    aria-label={`删除颜色 ${normalized}`}
                    className="color-preset-delete"
                    icon={<CloseOutlined />}
                    onClick={() => deleteColorPreset(normalized)}
                    type="text"
                  />
                </div>
              );
            })}
            <Button
              aria-label="添加颜色"
              className="add-preset-button"
              disabled={colors.length >= MAX_COLOR_PRESETS}
              icon={<PlusOutlined />}
              onClick={onAddColorPreset}
              type="text"
            />
          </div>
        </section>
      </div>
    </section>
  );
}
