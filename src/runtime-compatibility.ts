/** Exact API versions verified by this release; an untested rc is not a compatibility claim. */
export const TESTED_RUNTIME_VERSIONS: Readonly<Record<string,string>> = Object.freeze({
  '@deepseek-ai/cordis':'4.0.4',
  '@deepseek-ai/dsh-api-session-controller':'0.2.0-rc.2',
  '@deepseek-ai/dsh-api-workspace-controller':'0.2.0-rc.2',
  '@deepseek-ai/dsh-tools':'0.2.0-rc.2',
  '@deepseek-ai/dsh-home-paths':'0.2.0-rc.2',
  '@deepseek-ai/dsh-agent':'0.2.0-rc.2',
  '@deepseek-ai/dsh-session':'0.2.0-rc.2',
  '@deepseek-ai/dsh-subagent':'0.2.0-rc.2',
  '@deepseek-ai/dsh-persona':'0.2.0-rc.2',
  '@deepseek-ai/dsh-llm':'0.2.0-rc.2',
  '@deepseek-ai/schemastery':'3.18.4',
})

export function runtimeCompatibilityProblems(versions:Record<string,string|undefined>):string[]{
  return Object.entries(TESTED_RUNTIME_VERSIONS).flatMap(([name,expected])=>
    versions[name]===expected?[]:[versions[name]===undefined
      ? `${name}: 无法解析版本（本版验证 ${expected}）`
      : `${name}@${versions[name]} 尚未验证；本版支持 ${expected}`])
}
