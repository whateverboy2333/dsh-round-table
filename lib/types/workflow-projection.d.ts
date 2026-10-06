import type { Meeting } from './meetings.ts';
import type { WorkflowRun, WorkflowNodeView, WorkflowPlan } from './workflow-types.ts';
export declare const workflowHash: (v: unknown) => string;
export { latestActivation, workflowSlot } from './workflow-slot.ts';
export declare function workflowViews(m: Meeting, run: WorkflowRun, ignoreActivationFor?: Set<string>): WorkflowNodeView[];
export declare function previewWorkflow(m: Meeting, run: WorkflowRun, nodeIds: string[], retry?: boolean): WorkflowPlan;
