/** Own file drags only inside this pane; the official host owns all other targets. */
export declare const PANEL_FILE_DROP = "round-table-file-drop";
export declare const PANEL_FILE_DRAG = "round-table-file-drag";
export declare function installPanelFileDrop(panel: HTMLElement): () => void;
