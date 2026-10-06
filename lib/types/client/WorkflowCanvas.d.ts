import type { WorkflowDefinition, WorkflowNodeView, WorkflowRun } from '../workflow-types.ts';
export declare const workflowLabels: Record<string, string>;
export declare const workflowColor: (status?: string) => "#16794c" | "#2470b5" | "#a55d00" | "#85858b" | "#5b6677";
export declare function WorkflowCanvas({ definition, views, run, selected, onSelect, onMove, zoom, members, readOnly, selectedEdge, onSelectEdge, onConnect, onZoomChange, fitRequest, manualZoomRequest }: {
    definition: WorkflowDefinition;
    views: WorkflowNodeView[];
    run?: WorkflowRun;
    selected: string;
    onSelect: (id: string) => void;
    onMove: (id: string, x: number, y: number) => void;
    zoom: number;
    members: {
        id: string;
        name: string;
    }[];
    readOnly?: boolean;
    selectedEdge?: string;
    onSelectEdge?: (id: string) => void;
    onConnect?: (from: string, to: string) => void;
    onZoomChange?: (value: number) => void;
    fitRequest?: number;
    manualZoomRequest?: number;
}): React.ReactNode;
