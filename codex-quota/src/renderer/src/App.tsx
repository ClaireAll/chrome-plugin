import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  ConfigProvider,
  Dropdown,
  Spin,
  Tooltip,
  type MenuProps
} from 'antd'
import {
  BgColorsOutlined,
  CheckOutlined,
  ExportOutlined,
  MenuOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import type {
  QuotaSnapshot,
  QuotaState,
  ThemeKey
} from '../../shared/types'

type DragState = {
  startX: number
  startY: number
  moved: boolean
}

type ThemeToken = {
  label: string
  swatch: string
  primary: string
  text: string
  container: string
  elevated: string
}

const themeStorageKey = 'codex-quota.theme'

const themeOptions: Array<{ key: ThemeKey; token: ThemeToken }> = [
  {
    key: 'light',
    token: {
      label: '清透浅色',
      swatch: '#eaf3ff',
      primary: '#2563eb',
      text: '#172033',
      container: '#f8fbff',
      elevated: '#ffffff'
    }
  },
  {
    key: 'midnight',
    token: {
      label: '午夜石墨',
      swatch: '#18243a',
      primary: '#45a3ff',
      text: '#f3f7ff',
      container: '#111b2c',
      elevated: '#1c2940'
    }
  },
  {
    key: 'sand',
    token: {
      label: '暖砂橙',
      swatch: '#f3dfc9',
      primary: '#b8683d',
      text: '#3f2a25',
      container: '#fffaf3',
      elevated: '#fffdf9'
    }
  },
  {
    key: 'aurora',
    token: {
      label: '极光蓝紫',
      swatch: '#e7e5ff',
      primary: '#6658e8',
      text: '#202345',
      container: '#f6f7ff',
      elevated: '#ffffff'
    }
  }
]

const themeTokens = Object.fromEntries(
  themeOptions.map(({ key, token }) => [key, token])
) as Record<ThemeKey, ThemeToken>

const initialState: QuotaState = {
  status: 'loading',
  snapshot: null,
  message: '正在读取额度…'
}

function isThemeKey(value: string): value is ThemeKey {
  return themeOptions.some(({ key }) => key === value)
}

function readStoredTheme(): ThemeKey {
  try {
    const saved = window.localStorage.getItem(themeStorageKey)
    return saved && isThemeKey(saved) ? saved : 'light'
  } catch {
    return 'light'
  }
}

function formatPercent(value: number | undefined): string {
  return typeof value === 'number' ? String(Math.round(value)) + '%' : '--'
}

function formatReset(resetAt: number | null | undefined): string {
  if (
    typeof resetAt !== 'number' ||
    !Number.isFinite(resetAt) ||
    resetAt <= 0
  ) {
    return '接口未提供'
  }

  const date = new Date(resetAt)
  if (Number.isNaN(date.getTime())) {
    return '接口未提供'
  }

  const parts = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  )
  const hour = String(values.hour ?? '').padStart(2, '0')
  const minute = String(values.minute ?? '').padStart(2, '0')
  return `${values.month ?? '--'}月${values.day ?? '--'}日 ${hour}:${minute}`
}

function formatUpdatedAt(fetchedAt: string | undefined): string {
  if (!fetchedAt) {
    return '接口未提供'
  }
  return formatReset(Date.parse(fetchedAt))
}

function colorForPercent(value: number | undefined): string {
  if (typeof value !== 'number') {
    return 'var(--quota-muted)'
  }
  if (value > 50) {
    return 'var(--quota-good)'
  }
  if (value >= 20) {
    return 'var(--quota-warning)'
  }
  return 'var(--quota-danger)'
}

function quotaValue(
  snapshot: QuotaSnapshot | null,
  key: 'fiveHour' | 'weekly'
): number | undefined {
  const value = snapshot?.[key]?.remainingPercent
  return typeof value === 'number' ? value : undefined
}

function pointerPoint(event: React.PointerEvent): { x: number; y: number } {
  if (Number.isFinite(event.screenX) && Number.isFinite(event.screenY)) {
    return { x: event.screenX, y: event.screenY }
  }
  return { x: event.clientX, y: event.clientY }
}

function CardQuota({
  label,
  value
}: {
  label: string
  value: number | undefined
}) {
  return (
    <div className="quota-value">
      <span className="quota-label">{label}</span>
      <span
        className="quota-percent"
        style={{ color: colorForPercent(value) }}
      >
        {formatPercent(value)}
      </span>
    </div>
  )
}

function App() {
  const [state, setState] = useState<QuotaState>(initialState)
  const [expanded, setExpanded] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeKey>(readStoredTheme)
  const dragState = useRef<DragState | null>(null)

  const snapshot = state.snapshot
  const busy = state.status === 'loading' || isRefreshing
  const activeTheme = themeTokens[theme]

  useEffect(() => {
    let disposed = false
    const unsubscribe = window.desktop.onQuotaStateChanged((nextState) => {
      if (!disposed) {
        setState(nextState)
      }
    })

    void window.desktop.getQuotaState().then((nextState) => {
      if (!disposed) {
        setState(nextState)
      }
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleWindowBlur = () => {
      if (!dragState.current) {
        return
      }
      window.desktop.endWindowDrag()
      dragState.current = null
      setIsDragging(false)
    }

    window.addEventListener('blur', handleWindowBlur)
    return () => window.removeEventListener('blur', handleWindowBlur)
  }, [])

  const setExpandedMode = async (nextExpanded: boolean) => {
    if (isTransitioning || nextExpanded === expanded) {
      return
    }

    setExpanded(nextExpanded)
    setIsTransitioning(true)
    try {
      await window.desktop.setWindowSize(
        nextExpanded ? 'expanded' : 'collapsed'
      )
    } finally {
      setIsTransitioning(false)
    }
  }

  const refresh = async () => {
    setIsRefreshing(true)
    try {
      setState(await window.desktop.refreshQuota())
    } finally {
      setIsRefreshing(false)
    }
  }

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0 || isTransitioning) {
      return
    }

    const point = pointerPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = {
      startX: point.x,
      startY: point.y,
      moved: false
    }
    setIsDragging(true)
    window.desktop.beginWindowDrag()
  }

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const drag = dragState.current
    if (!drag) {
      return
    }

    const point = pointerPoint(event)
    const distance = Math.hypot(
      point.x - drag.startX,
      point.y - drag.startY
    )
    if (distance >= 4) {
      drag.moved = true
    }
    if (drag.moved) {
      window.desktop.moveWindowDrag()
    }
  }

  const finishPointer = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!dragState.current) {
      return
    }

    window.desktop.endWindowDrag()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragState.current = null
    setIsDragging(false)
  }

  const changeTheme = (nextTheme: ThemeKey) => {
    setTheme(nextTheme)
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme)
    } catch {
      // The visual theme still applies for the current session.
    }
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key: rawKey }) => {
    const key = String(rawKey)
    if (key.startsWith('theme:')) {
      const nextTheme = key.slice('theme:'.length)
      if (isThemeKey(nextTheme)) {
        changeTheme(nextTheme)
      }
    }
  }

  const themeItems = useMemo<MenuProps['items']>(
    () =>
      themeOptions.map(({ key, token }) => ({
        key: 'theme:' + key,
        icon: (
          <span
            className="theme-swatch"
            style={{ backgroundColor: token.swatch }}
          />
        ),
        label: (
          <span className="theme-menu-label">
            {token.label}
            {theme === key && <CheckOutlined />}
          </span>
        )
      })),
    [theme]
  )

  const settingsMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'theme',
        icon: <BgColorsOutlined />,
        label: '主题',
        children: themeItems
      }
    ],
    [themeItems]
  )

  const menuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'refresh',
        icon: <ReloadOutlined />,
        label: '立即刷新'
      },
      {
        key: 'usage',
        icon: <ExportOutlined />,
        label: '打开官方用量页'
      },
      { type: 'divider' as const },
      ...(settingsMenuItems ?? [])
    ],
    [settingsMenuItems]
  )

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: activeTheme.primary,
          colorText: activeTheme.text,
          colorBgContainer: activeTheme.container,
          colorBgElevated: activeTheme.elevated,
          borderRadius: 10,
          fontSize: 12
        }
      }}
    >
      <Dropdown
        trigger={['contextMenu']}
        menu={{ items: menuItems, onClick: handleMenuClick }}
      >
        <div
          className={
            'app-stage theme-' +
            theme +
            (isDragging ? ' is-dragging' : '') +
            (isTransitioning ? ' is-transitioning' : '')
          }
        >
          <button
            type="button"
            className={'expand-trigger ' + (expanded ? 'collapse' : 'expand')}
            aria-label={expanded ? '收起额度详情' : '展开额度详情'}
            onClick={() => void setExpandedMode(!expanded)}
            disabled={isTransitioning || isDragging}
          >
            <span className="chevron chevron-one" />
            <span className="chevron chevron-two" />
            <span className="chevron chevron-three" />
          </button>

          <div className={'widget-shell ' + (expanded ? 'expanded' : 'collapsed')}>
            <div
              className="title-area"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            >
              <div className="widget-header">
                <div className="title-group">
                  <span className="title-mark">✦</span>
                  <span className="title">Codex 额度</span>
                  {busy && <Spin size="small" />}
                </div>
              </div>
            </div>

            <div className="quota-grid">
              <CardQuota
                label="5 小时"
                value={quotaValue(snapshot, 'fiveHour')}
              />
              <div className="quota-divider" />
              <CardQuota
                label="每周"
                value={quotaValue(snapshot, 'weekly')}
              />
            </div>

            <div className="status-line">
              <span className={'status-dot ' + state.status} />
              <span>
                {snapshot
                  ? `上次更新时间：${formatUpdatedAt(snapshot.fetchedAt)}`
                  : state.message}
              </span>
            </div>

            <div
              className={'expanded-content ' + (expanded ? 'is-open' : '')}
              aria-hidden={!expanded}
            >
              <div className="reset-row">
                <span>5 小时重置</span>
                <strong>{formatReset(snapshot?.fiveHour?.resetsAt)}</strong>
              </div>
              <div className="reset-row">
                <span>每周重置</span>
                <strong>{formatReset(snapshot?.weekly?.resetsAt)}</strong>
              </div>
              <div className="expanded-actions">
                <Button
                  className="action-button"
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={isRefreshing}
                  tabIndex={expanded ? 0 : -1}
                  onClick={() => void refresh()}
                >
                  刷新
                </Button>
                <Button
                  className="action-button"
                  size="small"
                  icon={<ExportOutlined />}
                  tabIndex={expanded ? 0 : -1}
                  onClick={() => void window.desktop.openUsagePage()}
                >
                  官方用量
                </Button>
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  open={settingsOpen}
                  onOpenChange={setSettingsOpen}
                  menu={{ items: settingsMenuItems, onClick: handleMenuClick }}
                >
                  <Tooltip title="更多设置" open={settingsOpen ? false : undefined}>
                    <Button
                      className="action-button settings-button"
                      size="small"
                      icon={<MenuOutlined />}
                      aria-label="更多设置"
                      tabIndex={expanded ? 0 : -1}
                    />
                  </Tooltip>
                </Dropdown>
              </div>
            </div>
          </div>
        </div>
      </Dropdown>
    </ConfigProvider>
  )
}

export default App
