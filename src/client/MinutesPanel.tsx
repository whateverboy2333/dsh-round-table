import { useEffect,useRef,useState } from 'react';
import type { MinutesJob, MinutesRecord, MinutesScope } from '../minutes-types.ts';
import {meetingCall,downloadText,localScopeId} from './ui-state.ts';
import {useScopedOperations} from './use-scoped-operations.ts';
const button: React.CSSProperties = { font: 'inherit', padding: '5px 9px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)', color: 'inherit', cursor: 'pointer' };
const statusName=(s:string)=>({completed:'已提交',accepted:'已验收',changes_requested:'要求修改',not_reviewed:'未验收',queued:'等待投递',offline:'原窗口未连接',in_progress:'处理中',failed:'失败',cancelled:'已结束'} as Record<string,string>)[s]??s;
const scopeText=(m:MinutesRecord)=>m.integrity?.facts.taskScope?.mode==='since_last'?`本次增量涉及 ${m.integrity.facts.taskScope.changedTaskIds.length} 项任务${m.integrity.facts.taskScope.addedTaskIds?'，其中新增 '+m.integrity.facts.taskScope.addedTaskIds.length+' 项':''}；下方总数为全会快照。`:'';
const factsMarkdown=(m:MinutesRecord)=>m.integrity?'\n\n## 系统事实与核对\n'+m.integrity.facts.scopeLabel+'；任务'+m.integrity.facts.counts.total+'项，已验收'+m.integrity.facts.counts.accepted+'项。\n'+m.integrity.warnings.join('\n')+'\n'+m.integrity.coverage+'\n'+scopeText(m):'';
const minutesMarkdown=(m:MinutesRecord)=>`# 会议纪要\n\n${m.summary}\n\n`+[['关键决策',m.keyDecisions],['任务进展',m.taskProgress],['未决事项',m.openItems]].map(([title,items])=>`## ${title}\n\n${(items as string[]).map(x=>`- ${x}`).join('\n')||'无'}`).join('\n\n')+factsMarkdown(m);
export function MinutesPanel({ meetingId, ready, minutes = [], job, onChanged, formalOnly=false, publishedIds=[],members=[] }: {
    members?:{id:string;name:string}[];
    formalOnly?: boolean;
    publishedIds?: string[];
    meetingId: string;
    ready: boolean;
    minutes?: MinutesRecord[];
    job?: MinutesJob;
    onChanged: () => Promise<void>;
}): React.ReactNode {
    const {meetingCall,isCurrent}=useScopedOperations();
    const [share,setShare]=useState<{id:string;mode:'send'|'publish'|'review'}>();
    const [shareError,setShareError]=useState('');
    const guard=useRef(false),dialog=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement>();
    const closeShare=()=>{if(guard.current)return;setShare(undefined);setShareError('');returnFocus.current?.focus()};
    const openShare=(value:NonNullable<typeof share>,trigger:HTMLElement)=>{returnFocus.current=trigger;setShareError('');setShare(value)};
    useEffect(()=>{if(share)dialog.current?.focus()},[share?.id,share?.mode]);
    useEffect(()=>()=>{returnFocus.current?.focus()},[]);
    const [scope, setScope] = useState<MinutesScope>('full');
    const [busy, setBusy] = useState<string | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [inputPreview,setInputPreview]=useState<{source:string;events:unknown[];members:{sessionId:string;messages:{text:string}[]}[]}>();
    const action = async (name: string, body: Record<string, unknown> = {}, contextual=false):Promise<boolean> => {
        if (guard.current) return false;
        if(!isCurrent()){const message='DSH 实例已变化，请重新打开圆桌并核对纪要';if(contextual)setShareError(message);else setError(message);return false}
        guard.current=true;
        setBusy(name);
        setError(undefined);
        if(contextual)setShareError('');
        try {
            await meetingCall(meetingId,name,body);
            if(!isCurrent())return true;
            try{await onChanged()}catch(e){setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`)}
            return true;
        }
        catch (e) {
            const message=e instanceof Error ? e.message : String(e);
            if(contextual)setShareError(message);else setError(message);
            return false;
        }
        finally {
            setBusy(undefined);
            guard.current=false;
        }
    };
    return <section data-round-table-minutes="" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 }}>
    <strong>会议纪要 · 草稿 → 核对 → 分享</strong>
    <label>整理范围 <select aria-label="纪要范围" value={scope} onChange={e => setScope(e.target.value as MinutesScope)} disabled={!!busy || job?.status === 'running'} style={button}><option value="full">全量</option><option value="since_last">自上次以来</option></select></label>
    <p style={{ margin: 0, opacity: .7 }}>{formalOnly?'只整理正式会议消息、任务状态与人工发布内容，不读取未发布的原窗口私聊。':'读取参会范围内的原会话发言。'}纪要先保存预览，不自动发送。{scope === 'since_last' && !minutes.some(m => m.cursors&&(!formalOnly||m.source==='formal')) ? ' 尚无同来源生成基线，将按全量整理。' : ''}</p>
    <div style={{ display: 'flex', gap: 6 }}>
      <button style={button} disabled={!!busy||job?.status==='running'} onClick={()=>{setBusy('preview');void meetingCall(meetingId,'minutes-data',{scope}).then(v=>{if(isCurrent())setInputPreview(v.data)}).catch(e=>{if(isCurrent())setError(String(e))}).finally(()=>{if(isCurrent())setBusy(undefined)})}}>预览读取范围</button>
      <button type="button" style={button} disabled={!ready || !!busy || job?.status === 'running'} onClick={() => { void action('minutes', { scope }); }}>生成纪要</button>
      {job?.status === 'running' && <button type="button" style={button} disabled={!!busy} onClick={() => { void action('cancel-minutes'); }}>取消生成</button>}
    </div>
    {inputPreview&&<div role="region" aria-label="纪要输入预览"><b>{inputPreview.source==='formal'?'正式会议资料':'包括参会期原会话回复'}</b><p>{inputPreview.events.length} 条会议记录；{inputPreview.members.reduce((n,m)=>n+m.messages.length,0)} 条原会话回复。生成时会重新读取最新数据。</p><button style={button} onClick={()=>downloadText('minutes-input.json',JSON.stringify(inputPreview,null,2),'application/json')}>导出完整输入核对</button><button style={button} onClick={()=>setInputPreview(undefined)}>关闭预览</button></div>}
    {!ready && job?.status !== 'running' && <p style={{ margin: 0 }}>请先配置会议秘书。</p>}
    {!minutes.length&&job?.status!=='running'&&ready&&<p style={{margin:0}}>还没有纪要。先在讨论中记录内容，再选择整理范围并生成；生成后可以保留不发送。</p>}
    {job?.status === 'running' && <p role="status" style={{ margin: 0 }}>正在整理…已启动 {job.modelCalls} 次生成</p>}
    {(job?.status === 'failed' || job?.status === 'cancelled') && <p role="alert" style={{ margin: 0, color: 'var(--dsw-alias-state-error-primary)' }}>{job.error ?? '生成已取消'}（未推进读取范围）</p>}
    {error && <p role="alert" style={{ margin: 0, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>}
    {[...minutes].reverse().map((m, index) => <details key={m.id} open={index === 0} data-minutes-id={m.id} style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8 }}>
      <summary style={{ cursor: 'pointer' }}>{new Date(m.generatedAt).toLocaleString()} · {m.scope === 'full' ? '全量' : '增量'} · {m.sent ? '已发送' : m.deliveries?.some(d => d.status === 'delivered') ? '部分发送' : '未发送'}</summary>
      <strong>摘要</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.summary}</p>
      {([['关键决策', m.keyDecisions], ['任务进展与责任', m.taskProgress], ['未决事项与下一步', m.openItems]] as const).map(([label, items]) => <div key={label}><strong>{label}</strong>{items.length ? <ul style={{ paddingLeft: 18, overflowWrap: 'anywhere' }}>{items.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>无</p>}</div>)}
      {m.integrity&&<p role={m.integrity.warnings.length?'alert':'status'}>{m.integrity.warnings.length?'发现内容冲突，请展开证据逐项核对。':m.integrity.reviewedAt?'主持人已核对；这不是自动认证。':'待人工核对。'}{!m.integrity.reviewedAt&&<button style={button} disabled={!!busy} onClick={e=>openShare({id:m.id,mode:'review'},e.currentTarget)}>核对后确认</button>}</p>}
      <details><summary>生成信息与原始证据</summary>
      <p style={{ opacity: .7 }}>{m.source==='formal'?'正式资料（含簿记与任务状态）':'原会话发言'} {m.sourceCount ?? '未知'} 条 · 子代理 {m.modelCalls} 次 · 模型步骤 {m.requestCount ?? '未提供计数'} 次（不含传输重试）</p>
      {m.cutoff && <p style={{ opacity: .7 }}>整理截止：{new Date(m.cutoff).toLocaleString()}</p>}
      {(m.missing?.length ?? m.missingSessionIds?.length ?? 0) > 0 && <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>部分数据缺失：{m.missing?.map(s => `${s.sessionId}（${s.error}）`).join('；') ?? m.missingSessionIds?.join('、')}。下次增量将重试缺失范围。</p>}
      {m.integrity&&<section aria-label="纪要事实核对" style={{border:'1px solid var(--dsw-alias-border-l2)',padding:10,borderRadius:8,marginBottom:8}}><b>{m.integrity.warnings.length?'发现内容冲突 · 需人工核对':m.integrity.reviewedAt?'主持人已核对 · 非自动认证':'待人工核对的纪要草稿'}</b><p>{m.integrity.facts.scopeLabel}：任务{m.integrity.facts.counts.total}项，已提交{m.integrity.facts.counts.submitted}项，已验收{m.integrity.facts.counts.accepted}项，待验收{m.integrity.facts.counts.awaitingReview}项，要求修改{m.integrity.facts.counts.changesRequested}项。</p>{scopeText(m)&&<p>{scopeText(m)}</p>}{m.integrity.warnings.map(w=><p key={w} role="alert">{w}</p>)}<p>{m.integrity.coverage}</p><details><summary>核对任务与成员依据</summary><p>成员：{m.integrity.facts.members.join('、')||'无'}</p>{m.integrity.facts.tasks.map(t=><div key={t.id} style={{padding:6,borderBottom:'1px solid var(--dsw-alias-border-l2)'}}><b>{t.member} · {t.title||'任务'}</b><p>{t.kind} · {statusName(t.status)} · {statusName(t.review)}</p>{t.result&&<p style={{whiteSpace:'pre-wrap'}}>{t.result}</p>}<small>{t.id} · 来源 {t.source}</small></div>)}</details></section>}
      {!m.integrity&&<p>历史纪要未记录系统核对快照；请对照原始任务核对，不自动标为已验收。</p>}
      </details>
      <button type="button" style={button} disabled={!!busy||publishedIds.includes(m.id)||!!m.integrity&&!m.integrity.reviewedAt} onClick={e=>openShare({id:m.id,mode:'publish'},e.currentTarget)}>{publishedIds.includes(m.id)?'已公开到会议':'公开到会议（不唤醒成员）'}</button>
      <button type="button" style={button} disabled={!!busy || m.sending || m.sent||!!m.integrity&&!m.integrity.reviewedAt} onClick={e=>openShare({id:m.id,mode:'send'},e.currentTarget)}>{m.sending ? '发送中…' : m.sent ? '已发送' : m.deliveries?.some(d => d.status === 'undelivered') ? '重试未送达成员' : '发送通知给成员'}</button>
      {!m.sent && <span style={{ marginLeft: 8, opacity: .7 }}>也可以保留不发送</span>}
      <button style={button} onClick={()=>downloadText(`纪要-${m.id}.md`,minutesMarkdown(m))}>导出此纪要</button><button style={button} onClick={()=>{void navigator.clipboard.writeText(minutesMarkdown(m)).catch(e=>setError(`复制失败，请使用导出：${String(e)}`))}}>复制纪要</button>
      {m.deliveries?.map(d => <p key={d.sessionId} style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{d.status === 'delivered' ? '✓ 已入队' : '✗ 未送达'} {members.find(x=>x.id===d.sessionId)?.name??d.sessionId}{d.error ? `：${d.error}` : ''}</p>)}
    </details>)}
    {share&&<div style={{position:'fixed',inset:0,zIndex:100,background:'rgba(0,0,0,.25)',display:'grid',placeItems:'center',padding:24}}>
      <div ref={dialog} role="alertdialog" aria-modal={true} aria-label="确认纪要操作" tabIndex={-1}
        onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeShare()}else if(event.key==='Tab'){const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');if(controls?.length){const first=controls[0]!,last=controls[controls.length-1]!;if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus()}}else{event.preventDefault();dialog.current?.focus()}}}}
        style={{padding:20,border:'1px solid var(--dsw-alias-border-l2)',borderRadius:12,background:'var(--dsw-alias-bg-base)',maxWidth:560,width:'100%',maxHeight:'80vh',overflow:'auto',boxSizing:'border-box'}}>
        <b>{share.mode==='review'?'确认已逐项核对':share.mode==='publish'?'公开到会议':'发送通知给成员'}</b>
        <p>{new Date(minutes.find(n=>n.id===share.id)?.generatedAt??0).toLocaleString()} · {minutes.find(n=>n.id===share.id)?.scope==='full'?'全量':'增量'} · {share.id.slice(-8)}</p>
        <blockquote style={{margin:'8px 0',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{minutes.find(n=>n.id===share.id)?.summary.slice(0,300)}</blockquote>
        <p>{share.mode==='review'?'请逐项核对系统数量、任务原结果、成员和正文。确认只记录你的核对动作，不会把模型内容自动认证为正确。':share.mode==='publish'?'把这份纪要作为会议资料公开，不唤醒任何成员。':'将发送给：'+(members.map(x=>x.name).join('、')||'本会普通成员')+'。成员可能开始回应并消耗模型额度，秘书不接收通知。'}</p>
        {minutes.find(n=>n.id===share.id)?.integrity?.warnings.length?<p role="alert">已有冲突仍保留，分享与导出附上冲突说明；若不接受，请取消并重新整理。</p>:null}
        {shareError&&<p role="alert">{shareError}。可重试同一份纪要，跳过已记录送达的成员；若上次投递结果不确定，请先核对原窗口。</p>}
        {busy&&<p role="status">正在提交，请等待结果…</p>}
        <button style={button} disabled={!!busy} onClick={()=>{const current=share;void action(current.mode==='review'?'review-minutes':current.mode==='publish'?'publish-minutes':'send-minutes',{minutesId:current.id,confirmed:true,acknowledgeConflicts:true},true).then(ok=>{if(ok)closeShare()})}}>{shareError?'重试此操作':'确认'}</button>
        <button style={button} disabled={!!busy} onClick={closeShare}>取消</button>
      </div>
    </div>}
  </section>;
}
