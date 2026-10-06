/**
 * 窗口选择器（P1 整顿，建会表单与后续"添加成员"共用的组件）：
 * - 数据源分层：useSessions 行（running 区分 live/离线）+ useWorkspaces 的
 *   archivedSessionIds（归档会话直接排除）；origin==='subagent' 排除（既有纪律）。
 * - 展示：live（正在工作）置顶带绿点；离线窗口置灰折叠进「离线窗口（N）」分组
 *   （默认收起；离线窗口仍可勾选——广播会拉起它们）；每行标题 + cwd 缩写。
 * - 搜索：按标题/cwd 过滤（不分组限制，命中离线分组时该组自动展开）。
 */

import { useEffect,useState } from 'react'

/** useSessions 行（结构面；框架实参是超集）。 */
export interface SessionRowLike {
  displayTitle: string
  cwd?: string
  running: boolean
  origin?: string
  blank: boolean
  connected?: boolean
}

export interface PickerRow {
  id: string
  row: SessionRowLike
}

export interface SessionPartition {
  live: PickerRow[]
  offline: PickerRow[]
}

/**
 * 分层纯函数（冒烟可测）：排除 subagent/已归档，按 running 分 live/离线两组；
 * query 非空时按标题/cwd 过滤（大小写不敏感）。
 */
export function partitionSessionRows(
  rows: readonly PickerRow[],
  archivedSessionIds: readonly string[],
  query: string,
): SessionPartition {
  const q = query.trim().toLowerCase()
  const filtered = rows.filter(({ id, row }) => {
    if (id.startsWith('round-table-secretary-')) return false
    if (row.origin === 'subagent') return false
    if (archivedSessionIds.includes(id)) return false
    if (q === '') return true
    return row.displayTitle.toLowerCase().includes(q) || (row.cwd ?? '').toLowerCase().includes(q)
  })
  return {
    live: filtered.filter(({ row }) => row.connected===true||(row.connected===undefined&&row.running)),
    offline: filtered.filter(({ row }) => row.connected===false||(row.connected===undefined&&!row.running)),
  }
}

/** cwd 缩写：取末两段（太长的单段截断）。 */
export function shortCwd(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  const parts = cwd.replace(/\\/g, '/').split('/').filter((part) => part !== '')
  const tail = parts.slice(-2).join('/')
  return tail.length > 28 ? `…${tail.slice(-27)}` : tail
}

const textPrimary: React.CSSProperties = { color: 'var(--dsw-alias-label-primary)' }
const textSecondary: React.CSSProperties = { color: 'var(--dsw-alias-label-secondary)' }
const textTertiary: React.CSSProperties = { color: 'var(--dsw-alias-label-tertiary)' }

function PickerRowItem({ id, row, checked, offline, onToggle }: {
  id: string
  row: SessionRowLike
  checked: boolean
  offline: boolean
  onToggle: (id: string) => void
}): React.ReactNode {
  return (
    <label
      data-round-table-session={id}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
        cursor: 'pointer', fontSize: 13, opacity: offline ? 0.85 : 1, ...textPrimary,
      }}
    >
      <input type="checkbox" checked={checked} onChange={() => { onToggle(id) }} />
      <span
        title={row.connected===false?'原窗口未连接':row.connected===undefined?'连接状态待检查':row.running?'原窗口忙碌':'可投递'}
        style={{
          flex: 'none', width: 8, height: 8, borderRadius: '50%',
          background: offline ? 'var(--dsw-alias-label-caption)' : 'var(--dsw-alias-state-business-primary)',
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.displayTitle}
        <span style={{ fontSize: 11, ...textTertiary }}>（{row.connected===false?'未连接':row.connected===undefined?'待检查':row.running?'忙碌':'空闲'}）</span>
      </span>
      {row.cwd !== undefined && (
        <span style={{ marginLeft: 'auto', flex: 'none', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, ...textTertiary }}>
          {shortCwd(row.cwd)}
        </span>
      )}
    </label>
  )
}

export function SessionPicker({ rows, archivedSessionIds, checked, onToggle }: {
  rows: readonly PickerRow[]
  archivedSessionIds: readonly string[]
  checked: ReadonlySet<string>
  onToggle: (id: string) => void
}): React.ReactNode {
  const [query, setQuery] = useState('')
  const [showOffline, setShowOffline] = useState(false)
  const [connections,setConnections]=useState<Record<string,boolean>>({})
  const idsKey=rows.map(r=>r.id).join('|')
  useEffect(()=>{let alive=true;void fetch('/plugins/round-table/meetings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'availability',ids:rows.map(r=>r.id)})}).then(r=>r.json()).then(v=>{if(alive)setConnections(v.connections??{})}).catch(()=>{});return()=>{alive=false}},[idsKey])
  const { live, offline } = partitionSessionRows(rows.map(r=>({...r,row:{...r.row,connected:connections[r.id]??r.row.connected}})), archivedSessionIds, query)
  // 搜索命中离线分组时自动展开（收起状态只在无搜索词时生效）
  const offlineVisible = showOffline || query.trim() !== ''

  return (
    <div data-round-table-session-picker="" style={{ display: 'flex', flexDirection: 'column', flex: 'none', minWidth: 0, gap: 4 }}>
      <input
        data-round-table-session-search=""
        style={{
          flex: 'none', boxSizing: 'border-box', width: '100%',
          border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8,
          background: 'var(--dsw-alias-bg-base)', fontFamily: 'inherit', fontSize: 12,
          lineHeight: '20px', padding: '4px 8px', outline: 'none', ...textPrimary,
        }}
        placeholder="搜索窗口（标题 / 目录）…"
        value={query}
        onChange={(event) => { setQuery(event.target.value) }}
      />
      <div style={{ flex: 'none', maxHeight: 220, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {live.length === 0 && offline.length === 0 && (
          <p style={{ margin: '4px 0', fontSize: 12, ...textTertiary }}>
            {query.trim() === '' ? '（没有可选的会话窗口）' : `（无匹配「${query.trim()}」的窗口）`}
          </p>
        )}
        {live.map(({ id, row }) => (
          <PickerRowItem key={id} id={id} row={row} checked={checked.has(id)} offline={false} onToggle={onToggle} />
        ))}
        {offline.length > 0 && (
          <>
            <button
              type="button"
              data-round-table-offline-group=""
              aria-expanded={offlineVisible}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11, textAlign: 'left', ...textTertiary,
              }}
              onClick={() => { setShowOffline((v) => !v) }}
            >
              {offlineVisible ? '▾' : '▸'} 未连接或待检查（{offline.length}）
            </button>
            {offlineVisible && offline.map(({ id, row }) => (
              <PickerRowItem key={id} id={id} row={row} checked={checked.has(id)} offline={true} onToggle={onToggle} />
            ))}
          </>
        )}
      </div>
      {live.length > 0 && (
        <span style={{ flex: 'none', fontSize: 11, ...textSecondary }}>
          {live.length} 个可连接 · {offline.length} 个需检查；未运行不等于离线
        </span>
      )}
    </div>
  )
}
