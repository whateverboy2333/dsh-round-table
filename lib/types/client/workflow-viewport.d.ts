import type { WorkflowDefinition, WorkflowEdge } from '../workflow-types.ts';
export declare const WORKFLOW_MIN_ZOOM = 0.1, WORKFLOW_MAX_ZOOM = 1.6;
export declare const clampWorkflowZoom: (value: number) => number;
export declare const workflowPosition: (definition: WorkflowDefinition, id: string) => {
    x: number;
    y: number;
};
/** Shared by painting and bounds calculation, including return rails and curve controls. */
export declare function workflowEdgeGeometry(definition: WorkflowDefinition, edge: WorkflowEdge): {
    path: string;
    points: number[][];
    labelX: number;
    labelY: number;
};
export declare function workflowSurface(definition: WorkflowDefinition, origin?: {
    x: number;
    y: number;
}): {
    width: number;
    height: number;
    fitWidth: number;
    fitHeight: number;
    centerX: number;
    centerY: number;
    offsetX: number;
    offsetY: number;
};
export declare function fitWorkflowZoom(surface: {
    width: number;
    height: number;
    fitWidth?: number;
    fitHeight?: number;
}, width: number, height: number): number;
export declare const workflowAvailableHeight: (top: number, bottom: number) => number;
export declare function anchoredWorkflowScroll(oldZoom: number, newZoom: number, scrollLeft: number, scrollTop: number, x: number, y: number): {
    left: number;
    top: number;
};
