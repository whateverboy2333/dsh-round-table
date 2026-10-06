import type {ReleaseTask} from '../meeting-flow-types.ts'
export function taskRecoveryText(task:ReleaseTask):{title:string;next:string}|undefined{
 if(task.restoration?.state==='restoring')return {title:'正在恢复原成员会话',next:'插件正在恢复同一窗口与原工作区，完成后继续这次已授权投递；无需离开会议打开窗口。'}
 switch(task.status){
  case 'offline':return {title:'恢复或投递需要处理',next:task.error??'在成员边栏重试原会话恢复；已归档或已删除时可以移出会议。不会创建替代成员或复制任务。'}
  case 'queued':return {title:'已授权，正在等待投递条件',next:'检查原窗口忙碌状态或前一项任务。已有授权的队列满足条件后可以继续，无需重复点击开始。'}
  case 'delivered':case 'in_progress':return {title:'已送达，等待正式结果',next:'先查看原窗口。如果已经回答却没有提交，可选择准确的原回复人工补交；不再需要时结束本会等待。'}
  case 'uncertain':return {title:'还不能确定原窗口是否收到',next:'先查看原窗口及投递记录。重试可能重复执行，必须核对后明确确认。'}
  case 'failed':return task.attempts===0?{title:'未投递，需要调整输入',next:'查看具体原因，调整资料或模型能力后复制为新任务；此任务尚不能人工补交。'}:{title:'任务未成功提交',next:'先查看原窗口与失败原因；有可用回复可人工补交，否则重新准备，或结束本会等待。'}
  default:return undefined
 }
}
export function TaskRecovery({task}:{task:ReleaseTask}):React.ReactNode{const info=taskRecoveryText(task);return info?<div data-task-recovery={task.taskId} style={{padding:8,margin:'7px 0',background:'var(--dsw-alias-interactive-bg-hover)',borderRadius:7,fontSize:12}}><b>{info.title}</b><p style={{margin:'4px 0 0'}}>{info.next}</p></div>:null}
