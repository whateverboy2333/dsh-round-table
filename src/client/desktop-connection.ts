import type {RoundTableConnection} from './MeetingPanel.tsx'
import type {ClientRemote} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/remote'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/remote'

/** 0.2 Remote calls return Result directly; the 0.1 wire adapter wrapped it. */
export function desktopConnection(remote: ClientRemote): RoundTableConnection {
  return {homePath:()=>remote.$host?.home,api:{
    sessions: {create:async(input)=>({result:await remote.session.create(input as never)}),rename:async(input)=>({result:await remote.session.rename(input as never)})},
    workspace:{list:async()=>{
      const stream=remote.workspace.follow(AbortSignal.timeout(10000)),iterator=stream[Symbol.asyncIterator]()
      try {
        const first=await iterator.next()
        if(first.done||first.value.type!=='baseline')throw new Error('工作区名册尚未就绪')
        return {result:{ok:true as const,value:{items:[...first.value.value.items]}}}
      } finally {await iterator.return?.()}
    }},
    agentPresets:{list:async()=>{const result=await remote.agentPresets.list();return {result:result.ok?{ok:true as const,value:{presets:[...result.value.presets]}}:result}}},
  }}
}
