/** Pure GUI draft edits. Final saving still uses the host's full graph validator. */
import type { WorkflowDefinition, WorkflowEdge, WorkflowRun } from './workflow-types.ts';
type Running = Pick<WorkflowRun, 'status' | 'activations'>;
export declare function editWorkflowEdge(d: WorkflowDefinition, edge: WorkflowEdge, replaceId?: string, run?: Running): WorkflowDefinition;
export declare function removeWorkflowEdge(d: WorkflowDefinition, id: string, run?: Running): WorkflowDefinition;
export declare function removeWorkflowNode(d: WorkflowDefinition, id: string, run?: Running): WorkflowDefinition;
export {};
