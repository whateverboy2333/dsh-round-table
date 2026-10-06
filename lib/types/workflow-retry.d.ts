import type { Meeting } from './meetings.ts';
import type { WorkflowRun, WorkflowStatus } from './workflow-types.ts';
export declare function hasWorkflowResultConsumer(run: WorkflowRun, activationId: string, m?: Meeting): boolean;
export declare function workflowRetryIssues(m: Meeting, run: WorkflowRun, nodeId: string, status: WorkflowStatus): string[];
