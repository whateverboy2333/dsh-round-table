import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
/** Profile identity is absent in unsupported compositions; never assign a shared fallback. */
export function storageScope(profile:unknown):string|undefined{
 if(!profile||typeof profile!=='object')return
 const {home,name}=profile as {home?:unknown;name?:unknown}
 if(typeof home!=='string'||!home.trim()||typeof name!=='string'||!name.trim())return
 const absolute=resolve(home),normalized=process.platform==='win32'?absolute.toLowerCase():absolute
 return createHash('sha256').update(JSON.stringify([normalized,name])).digest('hex')
}
