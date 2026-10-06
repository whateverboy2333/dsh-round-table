/** User-owned sequence and parallel stages. Helpers carry dependencies, never execution authority. */
import type { WorkflowDefinition, WorkflowLimits, WorkflowNode, WorkflowRun } from './workflow-types.ts';
type Running = Pick<WorkflowRun, 'status' | 'activations'>;
export declare function isStepsDefinition(value: unknown): value is WorkflowDefinition & {
    steps: NonNullable<WorkflowDefinition['steps']>;
};
export declare function makeStepsDefinition(id: string, title?: string, limits?: WorkflowLimits): WorkflowDefinition;
export declare function stepsUserNodes(d: WorkflowDefinition): WorkflowNode[];
/** Rebuild ONLY structural fields. All real step fields and saved coordinates survive unchanged. */
export declare function compileStepsDefinition(d: WorkflowDefinition): WorkflowDefinition;
export declare function appendStepsNode(d: WorkflowDefinition, nodeId: string, stageId: string, afterStageId?: string, run?: Running): WorkflowDefinition;
export declare function addStepsParallel(d: WorkflowDefinition, targetNodeId: string, nodeId: string, stageId: string, run?: Running): WorkflowDefinition;
export declare function removeStepsNode(d: WorkflowDefinition, nodeId: string, run?: Running): WorkflowDefinition;
export declare function moveStepsStage(d: WorkflowDefinition, stageId: string, direction: 'up' | 'down', run?: Running): WorkflowDefinition;
export declare function patchStepsNode(d: WorkflowDefinition, nodeId: string, patch: Partial<WorkflowNode>, run?: Running): WorkflowDefinition;
export {};
