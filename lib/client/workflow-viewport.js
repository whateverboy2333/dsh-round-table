export const WORKFLOW_MIN_ZOOM = .1, WORKFLOW_MAX_ZOOM = 1.6;
export const clampWorkflowZoom = (value) => Math.max(WORKFLOW_MIN_ZOOM, Math.min(WORKFLOW_MAX_ZOOM, value));
export const workflowPosition = (definition, id) => definition.positions[id] ?? { x: 30, y: 30 };
/** Shared by painting and bounds calculation, including return rails and curve controls. */
export function workflowEdgeGeometry(definition, edge) {
    const a = workflowPosition(definition, edge.from), b = workflowPosition(definition, edge.to);
    const returning = edge.kind === 'loop', vertical = !returning && Math.abs(b.x - a.x) < 240;
    const sx = a.x + 220, sy = a.y + 58, tx = b.x, ty = b.y + 58;
    const lane = definition.edges.filter(e => e.kind === 'loop').findIndex(e => e.id === edge.id), rail = Math.max(6, b.x - 34 - lane * 14), bottom = Math.max(a.y, b.y) + 146 + lane * 14;
    const points = returning ? [[a.x + 110, a.y + 124], [a.x + 110, bottom], [rail, bottom], [rail, ty], [tx, ty]] : vertical ? [[a.x + 110, a.y + 124], [a.x + 110, a.y + 170], [b.x + 110, b.y - 40], [b.x + 110, b.y]] : [[sx, sy], [sx + 60, sy], [tx - 60, ty], [tx, ty]];
    const path = returning ? `M ${a.x + 110} ${a.y + 124} L ${a.x + 110} ${bottom} L ${rail} ${bottom} L ${rail} ${ty} L ${tx} ${ty}` : vertical ? `M ${a.x + 110} ${a.y + 124} C ${a.x + 110} ${a.y + 170}, ${b.x + 110} ${b.y - 40}, ${b.x + 110} ${b.y}` : `M ${sx} ${sy} C ${sx + 60} ${sy}, ${tx - 60} ${ty}, ${tx} ${ty}`;
    const labelX = returning ? (a.x + 110 + rail) / 2 : vertical ? a.x + 150 : (sx + tx) / 2, labelY = returning ? bottom - 6 : vertical ? (a.y + 124 + b.y) / 2 : (sy + ty) / 2 - 9;
    const label = returning ? '返回下一轮' : edge.label ?? '', labelWidth = Array.from(label).reduce((sum, ch) => sum + (ch.codePointAt(0) >= 0x2e80 ? 12 : 7), 0);
    if (label)
        points.push([labelX - labelWidth / 2, labelY - 12], [labelX + labelWidth / 2, labelY + 3]);
    return { path, points, labelX, labelY };
}
export function workflowSurface(definition, origin) {
    const points = definition.nodes.flatMap(n => { const p = workflowPosition(definition, n.id); return [[p.x - 10, p.y], [p.x + 230, p.y + 124]]; });
    for (const edge of definition.edges)
        points.push(...workflowEdgeGeometry(definition, edge).points);
    if (!points.length)
        return { width: 320, height: 180, fitWidth: 320, fitHeight: 180, centerX: 160, centerY: 90, offsetX: 84, offsetY: 64 };
    const minX = Math.min(...points.map(p => p[0])), minY = Math.min(...points.map(p => p[1])), maxX = Math.max(...points.map(p => p[0])), maxY = Math.max(...points.map(p => p[1]));
    // A fixed logical origin keeps dragging the first/only node from moving the
    // entire graph. Space at the left/top includes reverse curves and their controls.
    const offsetX = origin?.x ?? Math.max(84, 24 - minX), offsetY = origin?.y ?? Math.max(64, 24 - minY);
    return { width: maxX + offsetX + 24, height: maxY + offsetY + 24, fitWidth: maxX - minX + 48, fitHeight: maxY - minY + 48, centerX: (minX + maxX) / 2 + offsetX, centerY: (minY + maxY) / 2 + offsetY, offsetX, offsetY };
}
export function fitWorkflowZoom(surface, width, height) {
    return clampWorkflowZoom(Math.min(1, Math.max(1, width) / (surface.fitWidth ?? surface.width), Math.max(1, height) / (surface.fitHeight ?? surface.height)));
}
export const workflowAvailableHeight = (top, bottom) => Math.max(120, Math.floor(bottom - top - 32));
export function anchoredWorkflowScroll(oldZoom, newZoom, scrollLeft, scrollTop, x, y) {
    return { left: Math.max(0, (scrollLeft + x) / oldZoom * newZoom - x), top: Math.max(0, (scrollTop + y) / oldZoom * newZoom - y) };
}
