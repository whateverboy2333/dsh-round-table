import {createHash} from 'node:crypto'
import type {MinutesOutput,MinutesRecord,MinutesFacts} from './minutes-types.ts'
/** Frozen structured evidence. Text is never mined to invent task status or people. */
export function minutesFacts(data:{scope:string;members:{sessionId:string}[];events:unknown[];taskSnapshot?:unknown[];taskChanges?:{addedTaskIds:string[];updatedTaskIds:string[]}},name:(id:string)=>string):MinutesFacts{
 const rows=new Map<string,MinutesFacts['tasks'][number]>(),events=data.events as Record<string,any>[]
 const add=(raw:Record<string,any>,kind:string,source:string)=>{if(typeof raw.taskId!=='string')return;rows.set(raw.taskId,{id:raw.taskId,member:name(raw.toSessionId??raw.memberId??'user'),status:String(raw.status),review:String(raw.review??'not_reviewed'),title:String(raw.title??''),result:typeof raw.result==='string'?raw.result:undefined,kind,source})}
 for(const e of (data.taskSnapshot??events) as Record<string,any>[])if(e.kind==='release-task')add(e,e.parentTaskId?'修改任务':e.temporary?'临时回应':e.workflow?'流程环节':'手动任务',String(e.id))
 if(!rows.size)for(const e of events)if(e.kind==='workflow-source')for(const r of e.results??[])add(r,e.revisionOfTaskId?'修改任务':e.temporary?'临时回应':'流程环节',String(e.id))
 const tasks=[...rows.values()],completed=tasks.filter(t=>t.status==='completed'),members=[...new Set(data.members.map(m=>name(m.sessionId)))]
 const taskScope:NonNullable<MinutesFacts['taskScope']>={mode:events.some(e=>e.kind==='workflow-context')?'workflow':data.scope==='since_last'?'since_last':'full',changedTaskIds:[...new Set(events.filter(e=>e.kind==='release-task').map(e=>String(e.taskId)))],...(data.taskChanges?{addedTaskIds:[...new Set(data.taskChanges.addedTaskIds)]}:{})}
 return {taskScope,scopeLabel:events.some(e=>e.kind==='workflow-context')?'本次流程冻结输入':data.scope==='since_last'?'采集时全会任务快照（正文仅增量）':'采集时全会任务快照',members,tasks,counts:{total:tasks.length,submitted:completed.length,accepted:completed.filter(t=>t.review==='accepted').length,changesRequested:completed.filter(t=>t.review==='changes_requested').length,awaitingReview:completed.filter(t=>!['accepted','changes_requested'].includes(t.review)).length,open:tasks.filter(t=>!['completed','cancelled','failed'].includes(t.status)).length},decisions:events.filter(e=>e.kind==='workflow-source'&&e.choice||e.kind==='message'&&e.by==='user'&&String(e.text).startsWith('【主持人标记为结论】')).map(e=>({source:String(e.id),text:String(e.choice??e.text)})),sourceDigest:createHash('sha256').update(JSON.stringify({tasks,members})).digest('hex')}
}
const numberOf=(s:string):number=>{if(/^\d+$/.test(s))return Number(s);const digits:Record<string,number>={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};let total=0,current=0;for(const c of s){if(c==='百'){total+=(current||1)*100;current=0}else if(c==='十'){total+=(current||1)*10;current=0}else current=digits[c]??0}return total+current}
/** Protect complete identities before splitting punctuation or interpreting scope words. */
function maskMembers(lines:string[],members:string[]){
 let prefix='\uE000';while(lines.some(line=>line.includes(prefix)))prefix+='\uE000'
 const names=[...new Set(members.filter(Boolean))].sort((a,b)=>b.length-a.length),tokens=new Map(names.map((name,i)=>[`${prefix}${i}\uE001`,name]))
 const byName=new Map([...tokens].map(([token,name])=>[name,token]))
 const re=names.length?new RegExp(names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'):undefined
 return {tokens,lines:re?lines.map(line=>line.replace(re,name=>byName.get(name)!)):lines}
}
/** Clear constraints intersect; unknown named or temporal subsets stay for human review. */
function scopedTasks(clause:string,facts:MinutesFacts,tokens:Map<string,string>):MinutesFacts['tasks']|undefined{
 const scope=facts.taskScope,people=[...tokens].filter(([token])=>clause.includes(token))
 const whole=/(?:全会|本会|全场|整场会议|全部会议|会议总计|会议总共)/.test(clause),added=/(?:新增|新建)/.test(clause),changed=/(?:本次变更|本次更新|本次涉及|增量范围|增量涉及)/.test(clause),revision=/(?:修改任务|接续任务)/.test(clause)
 if(people.length>1||/(?:历史|旧任务|初版|原版|此前|之前|原有|上次|某成员|其中|部分|某些|这些|前[一二三四五六七八九十\d]|后[一二三四五六七八九十\d])/.test(clause))return undefined
 // A remaining unknown subject must not become a whole-meeting claim just
 // because it contains “共”. Keep unknown parentheses intact for this check.
 let subject=clause.split(/[0-9零〇一二两三四五六七八九十百]+\s*项|(?:所有|全部|各项)任务|(?:暂无|没有|无)待验收任务/)[0]!
 for(const [token]of tokens)subject=subject.split(token).join('')
 subject=subject.replace(/(?:整场会议|全部会议|会议总计|会议总共|全会|本会|全场|本次变更|本次更新|本次涉及|增量范围|增量涉及|修改任务|接续任务|本次|本轮|本期|新增|新建|总共|总计|合计|全部|所有|各项|已验收|验收通过|已通过|共|的|均|都|[\s：:])/g,'')
 if(subject)return undefined
 let tasks=facts.tasks
 if(people.length)tasks=tasks.filter(t=>t.member===people[0]![1])
 if(added){if(scope?.addedTaskIds===undefined)return undefined;tasks=tasks.filter(t=>scope.addedTaskIds!.includes(t.id))}
 if(changed){if(scope?.changedTaskIds===undefined)return undefined;tasks=tasks.filter(t=>scope.changedTaskIds.includes(t.id))}
 if(revision)tasks=tasks.filter(t=>t.kind==='修改任务')
 if(added||changed)return tasks
 if(!whole&&/本次|本轮|本期/.test(clause)&&scope?.mode==='since_last')return undefined
 if(people.length||revision||whole||/(?:共|合计|总计|总共|全部|所有|各项|暂无待验收|没有待验收|无待验收)/.test(clause))return tasks
 if(scope?.mode!=='since_last'&&/^\s*[0-9零〇一二两三四五六七八九十百]+\s*项/.test(clause))return tasks
 return undefined
}
export function checkMinutesFacts(output:MinutesOutput,facts:MinutesFacts){
 const warnings:string[]=[],{lines,tokens}=maskMembers([output.summary,...output.keyDecisions,...output.taskProgress,...output.openItems],facts.members)
 const number='([0-9零〇一二两三四五六七八九十百]+)'
 const check=(clause:string,re:RegExp,expected:number,label:string)=>{for(const m of clause.matchAll(re)){const n=numberOf(m[1]!);if(n!==expected)warnings.push(`${label}不一致：正文“${m[0]}”，该范围系统记录${expected}。`)}}
 for(const line of lines){
  let inherited:MinutesFacts['tasks']|undefined
  for(const clause of line.split(/[，,。；;\n]|(?:但|且|其中)(?=本次|新增|全会|全部|共)/)){
   if(!clause.trim())continue
   const continuation=/^(?:均|全部|都|已验收|验收通过|已通过)/.test(clause.trim())&&![...tokens.keys()].some(t=>clause.includes(t))&&!/(?:新增|新建|本次|本轮|全会|本会)/.test(clause)
   const tasks=continuation&&inherited?inherited:scopedTasks(clause,facts,tokens)
   inherited=tasks
   if(tasks){
    check(clause,new RegExp(`(?:共|总计|合计|全部|总共)?\\s*${number}\\s*项\\s*(?:release-task|任务)(?=\\s*(?:均|全部|都|已|$))`,'g'),tasks.length,'任务数量')
    const accepted=tasks.filter(t=>t.status==='completed'&&t.review==='accepted').length,awaiting=tasks.filter(t=>t.status==='completed'&&!['accepted','changes_requested'].includes(t.review)).length
    check(clause,new RegExp(`(?:已验收|验收通过|已通过)(?:的任务)?[：:]?\\s*${number}\\s*项`,'g'),accepted,'已验收数量')
    if(tasks.length&&/(?:所有|全部|各项)任务(?:均|全部|都)?(?:已)?(?:验收通过|通过验收|已验收)/.test(clause)&&accepted!==tasks.length)warnings.push('正文称该范围任务全部已验收，但系统仍有未验收或退回任务。')
    if(/(?:暂无|没有|无)待验收任务/.test(clause)&&awaiting)warnings.push(`正文称该范围无待验收任务，系统仍有${awaiting}项。`)
   }
   if(!/(?:新增|本次|本轮|历史|其中|部分)/.test(clause)&&![...tokens.keys()].some(t=>clause.includes(t)))check(clause,new RegExp(`(?:共|总计|合计)\\s*${number}\\s*(?:位|名|个)\\s*(?:参会)?成员`,'g'),facts.members.length,'成员总数')
  }
 }
 return {state:warnings.length?'conflict' as const:'needs_review' as const,warnings:[...new Set(warnings)],facts,checkedAt:Date.now(),coverage:'仅对范围明确的数量表达进行核对；新增、变更与全会分别计算，范围不明的子集及其他文字仍需人工核对。'}
}
export function assertMinutesShareable(record:MinutesRecord){if(record.integrity&&!record.integrity.reviewedAt)throw Error('请先核对纪要草稿与系统事实，再决定公开或发送')}
export function minutesEvidenceText(record:MinutesRecord){const i=record.integrity;if(!i)return '';const c=i.facts.counts;return `\n\n【系统事实 · ${i.facts.scopeLabel}】任务${c.total}项，已提交${c.submitted}项，已验收${c.accepted}项，待验收${c.awaitingReview}项，要求修改${c.changesRequested}项。${i.facts.taskScope?.mode==='since_last'?`本次增量涉及${i.facts.taskScope.changedTaskIds.length}项${i.facts.taskScope.addedTaskIds?'，其中新增'+i.facts.taskScope.addedTaskIds.length+'项':''}。`:''}\n${i.warnings.length?'【核对发现的冲突】\n'+i.warnings.join('\n'):'文字仍需人工核对，不代表已自动证实全部结论。'}`}
