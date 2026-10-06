export declare const DEFAULT_DOCK_WIDTH = 380;
export declare function dockWidth(requested: number, available: number): number;
export declare function dockColumns(entry: HTMLElement | null): {
    sidebar: HTMLElement;
    main: HTMLElement;
    frame: HTMLElement;
    right: HTMLElement | undefined;
} | undefined;
export declare function dockGeometry(entry: HTMLElement | null, requested: number, viewport: number): {
    width: number;
    right: number;
    available: number;
    supported: boolean;
};
/** Reserve actual centre-column space without reparenting or unmounting the original Agent UI. */
export declare function reserveHostDock(entry: HTMLElement | null, width: number): () => void;
