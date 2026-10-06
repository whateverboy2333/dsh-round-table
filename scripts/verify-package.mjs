/** Inspect the npm file list without publishing or recursively running prepack. */
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtemp,rm,readFile,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,dirname,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cache=await mkdtemp(resolve(tmpdir(),'rt-package-cache-'))
try{
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['pack','--dry-run','--json','--ignore-scripts','--cache',cache],{cwd:root,encoding:'utf8',shell:process.platform==='win32',windowsHide:true})
 assert.equal(result.status,0,result.stderr||result.stdout)
 const [packed]=JSON.parse(result.stdout),paths=new Set(packed.files.map(f=>f.path)),pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
 let checks=1
 for(const path of [pkg.main,pkg.types,pkg.exports['./client'].default,pkg.exports['./client'].types,'cordis.patch.yml','LICENSE','README.md','README.en.md','docs/产品实现速查.md']){assert.ok(paths.has(path.replace(/^\.\//,'')),`Package missing ${path}`);checks++}
 for(const base of ['debate','debate-runner','flatteams-bridge','personas']){assert.ok(![...paths].some(p=>new RegExp(`(?:^|/)${base}\\.(?:js|d\\.ts)(?:\\.map)?$`).test(p)),`Obsolete ${base} shipped`);checks++}
 assert.ok(![...paths].some(p=>/^(?:src|scripts|node_modules|outputs|tmp)\//.test(p)||/(?:^|\/)(?:\.credentials\.yaml|\.npmrc|settings\.yaml|\.env(?:\..*)?)$/.test(p)),'Source/test/host-local files must not enter the runtime package');checks++
 for(const lang of ['README.md','README.en.md']){const text=await readFile(resolve(root,lang),'utf8');assert.match(text,/docs\/产品实现速查\.md/,'Packaged README must link to its packaged API reference');checks++}
 assert.ok(pkg.scripts.prepack?.includes('verify:package'),'Packing source must run the package gate');checks++
 console.log(`verify-package: ${checks} checks passed (${paths.size} files; ${packed.size} compressed bytes; runtime entrypoints, docs and obsolete-file exclusions)`)
}finally{
 const actual=await realpath(cache),temp=await realpath(tmpdir())
 if(!actual.startsWith(temp+sep)||!actual.split(sep).at(-1).startsWith('rt-package-cache-'))throw Error('Unsafe package cache cleanup')
 await rm(actual,{recursive:true,force:true})
}
