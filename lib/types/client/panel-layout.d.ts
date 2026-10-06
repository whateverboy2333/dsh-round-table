export declare const DEFAULT_PANEL_WIDTH = 380;
export declare const PANEL_WIDTH_KEY = "dsh-round-table.panel-width";
export declare function clampPanelWidth(width: number, viewport: number): number;
export declare function draggedPanelWidth(initial: number, startX: number, currentX: number, viewport: number): number;
/** The official AppFrame sets its grid columns inline; the entry lives in its sidebar column. */
export declare function sidebarColumn(entry: HTMLElement | null): HTMLElement | undefined;
export declare function expandedPanelLeft(column: HTMLElement | undefined, viewport: number): number;
