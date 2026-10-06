import {access,rm,realpath} from 'node:fs/promises'
import {resolve,dirname,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),lib=resolve(root,'lib')
const bases=['debate','debate-runner','flatteams-bridge','personas']
const exists=async p=>{try{await access(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
if(await exists(lib)){
 if(await realpath(lib)!==lib)throw Error('Refusing to clean a linked lib directory')
 for(const base of bases){
  for(const ext of ['ts','tsx','js'])if(await exists(resolve(root,'src',`${base}.${ext}`)))throw Error(`Obsolete module ${base} has source again; review the cleanup list first`)
  for(const file of [`${base}.js`,`${base}.js.map`,`types/${base}.d.ts`,`types/${base}.d.ts.map`]){
   const target=resolve(lib,file);if(!target.startsWith(lib+sep))throw Error('Cleanup path escaped lib')
   await rm(target,{force:true})
  }
 }
}
console.log('Build cleanup: removed only obsolete debate, bridge and persona artifacts (including declarations).')
