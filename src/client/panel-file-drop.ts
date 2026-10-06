/** Own file drags only inside this pane; the official host owns all other targets. */
export const PANEL_FILE_DROP='round-table-file-drop'
export const PANEL_FILE_DRAG='round-table-file-drag'
export function installPanelFileDrop(panel:HTMLElement):()=>void {
 const doc=panel.ownerDocument,view=doc.defaultView!;let active=false,resettingHost=false
 const composer=()=>Array.from(panel.querySelectorAll<HTMLElement>('[data-hosting-composer]')).find(node=>node.getClientRects().length>0)
 const modal=()=>Array.from(panel.querySelectorAll<HTMLElement>('[aria-modal="true"]')).some(node=>node.getClientRects().length>0)
 const notify=(detail:{active:boolean;error?:string;files?:File[]})=>{const target=composer();if(target)target.dispatchEvent(new CustomEvent(detail.files||detail.error?PANEL_FILE_DROP:PANEL_FILE_DRAG,{detail}))}
 const hint=(text:string)=>{panel.dataset.fileDropNotice=text;panel.dispatchEvent(new CustomEvent('round-table-file-hint',{detail:text}))}
 const reset=()=>{active=false;panel.dataset.fileDrag='idle';delete panel.dataset.fileDropNotice;notify({active:false});panel.dispatchEvent(new CustomEvent('round-table-file-hint',{detail:''}))}
 const file=(event:DragEvent)=>event.dataTransfer&&Array.from(event.dataTransfer.types).includes('Files')
 const own=(event:DragEvent)=>event.target instanceof Element&&event.target.closest('[data-round-table-panel]')===panel
 const stop=(event:DragEvent)=>{event.preventDefault();event.stopPropagation()}
 const clearHost=(event:DragEvent)=>{resettingHost=true;try{doc.body.dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:event.dataTransfer,clientX:-1,clientY:-1}))}finally{resettingHost=false}}
 const ready=(event:DragEvent)=>!!composer()&&!modal()&&event.target instanceof Element&&!!event.target.closest('.rt-chat')&&composer()!.dataset.fileDropEnabled==='true'
 const enter=(event:DragEvent)=>{
  if(!file(event)||!own(event))return
  stop(event)
  if(!active){
   active=true
   // Match the host's standard leave-viewport reset. Never synthesize a drop:
   // it would enqueue files in the original Agent composer.
   clearHost(event)
  }
  panel.dataset.fileDrag='active'
  const accepting=ready(event);event.dataTransfer!.dropEffect=accepting?'copy':'none'
  notify({active:true})
  hint(accepting?'松开即可加载到本会草稿':composer()&&!modal()?'请拖到本会讨论区；只读或待核实期间不能加载':'请回到讨论区拖入；不会加载到原 Agent 会话')
 }
 const leave=(event:DragEvent)=>{
  if(resettingHost||!file(event))return
  if(own(event)){stop(event);if(!(event.relatedTarget instanceof Node&&panel.contains(event.relatedTarget)))reset()}
  else if(event.clientX<=0||event.clientY<=0||event.clientX>=view.innerWidth||event.clientY>=view.innerHeight)reset()
 }
 const drop=(event:DragEvent)=>{
  if(!file(event)||!own(event))return
  stop(event);clearHost(event);const accepting=ready(event),files=Array.from(event.dataTransfer!.files)
  const directory=Array.from(event.dataTransfer!.items??[]).some(item=>item.webkitGetAsEntry?.()?.isDirectory)
  reset()
  if(directory||!files.length){const error='请拖入具体文件；暂不加载文件夹，原会话未接收。';notify({active:false,error});hint(error);return}
  if(!accepting){const error='此处不能加载文件；请回到可编辑的讨论区，原会话未接收。';if(!modal())notify({active:false,error});hint(error);return}
  notify({active:false,files})
 }
 const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&(active||panel.dataset.fileDropNotice))reset()}
 panel.addEventListener('dragenter',enter,true);panel.addEventListener('dragover',enter,true);panel.addEventListener('drop',drop,true)
 doc.addEventListener('dragleave',leave,true);view.addEventListener('dragend',reset);view.addEventListener('blur',reset);view.addEventListener('keydown',escape)
 return()=>{panel.removeEventListener('dragenter',enter,true);panel.removeEventListener('dragover',enter,true);panel.removeEventListener('drop',drop,true);doc.removeEventListener('dragleave',leave,true);view.removeEventListener('dragend',reset);view.removeEventListener('blur',reset);view.removeEventListener('keydown',escape);reset()}
}
