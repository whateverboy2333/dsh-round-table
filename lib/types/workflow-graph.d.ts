import type { GraphIssue, WorkflowDefinition, WorkflowEdge, WorkflowNode } from './workflow-types.ts';
export declare function validateWorkflowGraph(value: unknown): GraphIssue[];
/** Only an explicitly authored steps draft may remain empty or partially configured. */
export declare function validateWorkflowDraft(value: unknown): GraphIssue[];
export declare function assertWorkflowDraft(d: unknown): asserts d is WorkflowDefinition;
export declare function assertWorkflowGraph(d: unknown): asserts d is WorkflowDefinition;
export declare function workflowSemantic(d: WorkflowDefinition): {
    executionPolicy?: "per-node-v1";
    steps?: import("./workflow-types.ts").WorkflowStepsLayout;
    id: string;
    title: string;
    entryId: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    parallelGroups: import("./workflow-types.ts").ParallelGroup[];
    loops: import("./workflow-types.ts").LoopGroup[];
    limits: import("./workflow-types.ts").WorkflowLimits;
};
export declare function layoutWorkflow(d: WorkflowDefinition): WorkflowDefinition;
