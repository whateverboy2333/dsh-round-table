export const DEFAULT_PANEL_WIDTH = 380
export const PANEL_WIDTH_KEY = 'dsh-round-table.panel-width'
export function clampPanelWidth(width:number, viewport:number):number {
  const max=Math.max(1,Math.min(1100,viewport-24))
  return Math.min(max,Math.max(Math.min(320,max),Number.isFinite(width)?width:DEFAULT_PANEL_WIDTH))
}
export function draggedPanelWidth(initial:number,startX:number,currentX:number,viewport:number):number {
  return clampPanelWidth(initial+startX-currentX,viewport)
}
/** The official AppFrame sets its grid columns inline; the entry lives in its sidebar column. */
export function sidebarColumn(entry:HTMLElement|null):HTMLElement|undefined {
  let column=entry
  while(column?.parentElement){
    if(column.parentElement.style.gridTemplateColumns)return column
    column=column.parentElement
  }
  return undefined
}
export function expandedPanelLeft(column:HTMLElement|undefined,viewport:number):number {
  const right=column?.getBoundingClientRect().right
  return typeof right==='number'&&Number.isFinite(right)?Math.max(0,Math.min(Math.max(0,viewport-1),right)):0
}
