import { sidebarColumn } from "./panel-layout.js";
export const DEFAULT_DOCK_WIDTH = 380;
export function dockWidth(requested, available) {
    const space = Math.max(2, available), max = space >= 640 ? space - 320 : space / 2, min = Math.min(320, max);
    return Math.max(min, Math.min(max, Number.isFinite(requested) ? requested : DEFAULT_DOCK_WIDTH));
}
export function dockColumns(entry) {
    const sidebar = sidebarColumn(entry), main = sidebar?.nextElementSibling, frame = sidebar?.parentElement;
    if (!sidebar || !main || !frame)
        return undefined;
    const right = main.nextElementSibling;
    return { sidebar, main, frame, right };
}
export function dockGeometry(entry, requested, viewport) {
    const columns = dockColumns(entry);
    if (!columns)
        return { width: dockWidth(requested, viewport), right: 0, available: viewport, supported: false };
    const frame = columns.frame.getBoundingClientRect(), sidebar = columns.sidebar.getBoundingClientRect(), right = columns.right?.getBoundingClientRect().width ?? 0;
    const available = Math.max(2, frame.right - sidebar.right - right);
    return { width: dockWidth(requested, available), right: Math.max(0, viewport - frame.right + right), available, supported: true };
}
/** Reserve actual centre-column space without reparenting or unmounting the original Agent UI. */
export function reserveHostDock(entry, width) {
    const main = dockColumns(entry)?.main;
    if (!main)
        return () => { };
    const property = 'margin-right', previous = main.style.getPropertyValue(property), priority = main.style.getPropertyPriority(property), owned = `${width}px`;
    main.style.setProperty(property, owned);
    return () => { if (main.style.getPropertyValue(property) !== owned)
        return; if (previous)
        main.style.setProperty(property, previous, priority);
    else
        main.style.removeProperty(property); };
}
