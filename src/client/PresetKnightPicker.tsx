/** 官方预设名册的只读选人器。
 * 不读取 .agent-presets，不编辑人格；创建实际走公开 agentPreset.list / session.create wire。
 */
import { useEffect, useState } from 'react'

export interface PresetWire {
  id: string
  trust?: 'system' | 'user'
  name?: string
  description?: string
  broken?: string
}
export interface WorkspaceWire { workspaceId: string; title: string; path: string; sessionIds?: readonly string[] }
export interface KnightSelection { instanceId: string; presetId: string; title: string; presetName: string; role: string; workspaceId?: string }

export interface PresetApi {
  agentPresets: { list(input: {}): Promise<{ result: ({ ok: true; value: { presets: PresetWire[] } } | { ok: false; error: { message: string } }) }> }
}

const muted: React.CSSProperties = { color: 'var(--dsw-alias-label-tertiary)' }
const button: React.CSSProperties = { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 7, background: 'var(--dsw-alias-bg-base)', padding: '3px 8px', cursor: 'pointer', font: 'inherit' }

export function PresetKnightPicker({ api, workspaces, selected, onChange, followCurrentLabel }: {
  api: PresetApi
  workspaces: readonly WorkspaceWire[]
  selected: readonly KnightSelection[]
  onChange: (next: KnightSelection[]) => void
  followCurrentLabel?: string
}): React.ReactNode {
  const [presets, setPresets] = useState<PresetWire[] | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const load = async (): Promise<void> => {
    if (loading) return
    setLoading(true); setError(undefined)
    try {
      const response = await api.agentPresets.list({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      setPresets(response.result.value.presets)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const add = (presetId: string, workspaceId?: string): void => {
    const preset = presets?.find((item) => item.id === presetId)
    const presetName = preset?.name ?? presetId
    onChange([...selected, { instanceId: crypto.randomUUID(), presetId, title: presetName, presetName, role: '参会成员', workspaceId }])
  }
  const update = (instanceId: string, patch: Partial<KnightSelection>): void => onChange(selected.map((item) => item.instanceId === instanceId ? { ...item, ...patch } : item))
  const field: React.CSSProperties = { width:'100%', minWidth:0, maxWidth:'100%', boxSizing:'border-box', font:'inherit' }
  const labelStyle: React.CSSProperties = { display:'flex', flexDirection:'column', gap:4, marginTop:8, fontSize:12, minWidth:0 }
  const card: React.CSSProperties = { flex:'none', minWidth:0, padding:10, border:'1px solid var(--dsw-alias-border-l2)', borderRadius:8, boxSizing:'border-box', overflowWrap:'anywhere' }
  return <section data-round-table-preset-picker="" style={{ display:'flex', flexDirection:'column', flex:'none', minWidth:0, gap:8 }}>
    <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:6 }}>
      <span style={{fontSize:12,fontWeight:500}}>按预设创建骑士（{selected.length} 已选）</span>
      <button type="button" style={{...button,flexShrink:0,whiteSpace:'nowrap'}} onClick={()=>{void load()}} disabled={loading}>{loading?'读取中…':'刷新名册'}</button>
    </div>
    <p style={{margin:0,fontSize:11,lineHeight:'16px',...muted}}>骑士来自宿主已声明的预设；圆桌只让他们议事，不修改预设配置。</p>
    {error!==undefined&&<p role="alert" style={{margin:0,fontSize:12,color:'var(--dsw-alias-state-error-primary)'}}>读取预设失败：{error}</p>}
    {presets?.map(preset=><article key={preset.id} data-round-table-preset={preset.id} style={{...card,opacity:preset.broken===undefined?1:0.55}}>
      <div style={{minWidth:0,fontSize:12,lineHeight:'18px'}}><b>{preset.name??preset.id}</b> <small style={muted}>[{preset.trust===undefined?'已声明':preset.trust==='system'?'出厂':'用户'}]</small></div>
      <p style={{margin:'4px 0 8px',minWidth:0,fontSize:12,lineHeight:'18px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',...muted}}>{preset.description??preset.id}</p>
      {preset.broken!==undefined&&<p style={{fontSize:12,color:'var(--dsw-alias-state-error-primary)'}}>不可用：{preset.broken}</p>}
      <button type="button" data-round-table-add-instance={preset.id} style={{...button,display:'inline-flex',flexShrink:0,whiteSpace:'nowrap',maxWidth:'100%'}} disabled={preset.broken!==undefined} onClick={()=>add(preset.id)}>添加实例</button>
    </article>)}
    {selected.map(item=><article key={item.instanceId} data-round-table-knight={item.instanceId} style={card}>
      <b style={{fontSize:12}}>{item.presetName}</b>
      <label style={labelStyle}>骑士名<input style={field} data-round-table-knight-name={item.instanceId} value={item.title} onChange={event=>update(item.instanceId,{title:event.target.value})}/></label>
      <label style={labelStyle}>职责<input style={field} data-round-table-knight-role={item.instanceId} value={item.role} onChange={event=>update(item.instanceId,{role:event.target.value})}/></label>
      <label style={labelStyle}>工作区<select style={field} value={item.workspaceId??''} onChange={event=>update(item.instanceId,event.target.value===''?{workspaceId:undefined}:{workspaceId:event.target.value})}>
        <option value="">{followCurrentLabel===undefined?'跟随当前（未分区）':`跟随当前（${followCurrentLabel}）`}</option>
        {workspaces.map(workspace=><option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>)}
      </select></label>
      <button type="button" style={{...button,marginTop:8}} onClick={()=>onChange(selected.filter(candidate=>candidate.instanceId!==item.instanceId))}>移除</button>
    </article>)}
  </section>
}
