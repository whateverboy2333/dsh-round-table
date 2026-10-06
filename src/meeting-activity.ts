/** Reentrant admission gate: deleting meetings reject new work and drain admitted operations. */
import { AsyncLocalStorage } from 'node:async_hooks'
const scope = new AsyncLocalStorage<ReadonlySet<string>>()
const closed = new Set<string>()
const active = new Map<string, Set<Promise<void>>>()
export const activityKey = (root: string, id: string) => `${root}:${id}`
export function isMeetingClosing(root: string, id: string): boolean { return closed.has(activityKey(root,id)) }
export function closeMeetingAdmission(root: string, id: string): void { closed.add(activityKey(root,id)) }
export async function drainMeeting(root: string, id: string): Promise<void> { await Promise.all([...active.get(activityKey(root,id)) ?? []]) }
export async function withMeetingActivity<T>(root: string, id: string, fn: () => Promise<T>): Promise<T> {
  const key = activityKey(root,id)
  if (scope.getStore()?.has(key)) return fn()
  if (closed.has(key)) throw new Error('会议已删除或正在删除')
  let release!:()=>void
  const done = new Promise<void>(resolve=>{release=resolve})
  const set = active.get(key) ?? new Set<Promise<void>>(); active.set(key,set); set.add(done)
  try { return await scope.run(new Set([...(scope.getStore()??[]),key]),fn) }
  finally { release();set.delete(done);if(!set.size)active.delete(key) }
}
