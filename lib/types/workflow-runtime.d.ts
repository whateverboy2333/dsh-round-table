import { type Meeting } from './meetings.ts';
import { type WorkflowDefinition, type WorkflowRun, type WorkflowActivation } from './workflow-types.ts';
export declare function extendWorkflowBudget(meetingId: string, input: {
    runId: string;
    requestId: string;
    work: number;
    minutes: number;
    expected: {
        workAttempts: number;
        minutesStarts: number;
    };
    confirmed: boolean;
}): Promise<void>;
export declare function saveWorkflow(meetingId: string, value: unknown, expectedRevision?: number, confirmedFuture?: boolean): Promise<WorkflowDefinition>;
export declare function createWorkflowRun(meetingId: string, definitionRevision: number, requestId: string, mode?: 'manual' | 'automatic', confirmed?: boolean): Promise<WorkflowRun>;
export declare function previewPartialWorkflow(m: Meeting, r: WorkflowRun, joinId: string): {
    joinId: string;
    branches: {
        branchId: string;
        title: string;
        nodeIds: string[];
        submitted: boolean;
        active: boolean;
        ends: import("./workflow-types.ts").WorkflowNodeView[];
    }[];
    skipBranchIds: string[];
    fingerprint: string;
};
export declare function continuePartialWorkflow(meetingId: string, input: {
    runId: string;
    joinId: string;
    skipBranchIds: string[];
    fingerprint: string;
    confirmed: boolean;
    reason: string;
}): Promise<void>;
export declare function clearWorkflowChoice(meetingId: string, runId: string, nodeId: string, activationId?: string): Promise<void>;
export declare function queueWorkflowInput(meetingId: string, runId: string, nodeId: string, messageId: string): Promise<{
    slotKey: string;
    round: number;
}>;
export declare function addWorkflowInputs(meetingId: string, input: {
    runId: string;
    nodeId: string;
    requestId: string;
    text: string;
    messageIds: string[];
    assetIds: string[];
    confirmed: boolean;
}): Promise<{
    slotKey: string;
    round: number;
    messageId?: string;
}>;
/** Read-only exact target resolution, shared by the stage picker and atomic chat staging. */
export declare function workflowQueueTarget(m: Meeting, runId: string, nodeId: string): {
    run: WorkflowRun;
    node: import("./workflow-types.ts").WorkflowNode;
    slot: {
        loopId?: string | undefined;
        slotKey: string;
        round: number;
    };
};
export declare function bypassWorkflowNode(meetingId: string, input: {
    runId: string;
    nodeId: string;
    expectedActivationId?: string;
    confirmed: boolean;
    reason: string;
}): Promise<void>;
interface StartInput {
    runId: string;
    nodeIds: string[];
    fingerprint: string;
    requestId: string;
    retry?: boolean;
    confirmed?: boolean;
    automaticAdmission?: boolean;
    initial?: boolean;
}
export declare function activateWorkflowNodes(m: Meeting, input: StartInput): WorkflowActivation[];
export declare function startWorkflowNodes(meetingId: string, input: StartInput): Promise<WorkflowActivation[]>;
export declare function previewInitialWorkflow(m: Meeting, requestId: string): import("./workflow-types.ts").WorkflowPlan;
export declare function startInitialWorkflow(meetingId: string, input: {
    requestId: string;
    definitionRevision: number;
    fingerprint: string;
    mode?: 'manual' | 'automatic';
    confirmed?: boolean;
}): Promise<WorkflowActivation[]>;
export declare function chooseWorkflowPath(meetingId: string, runId: string, nodeId: string, edgeId: string, reason?: string): Promise<void>;
export declare function canCompleteWorkflow(m: Meeting, r: WorkflowRun): boolean;
export declare function controlWorkflow(meetingId: string, runId: string, action: 'pause' | 'resume' | 'stop' | 'complete'): Promise<void>;
export declare function recoverWorkflows(root: string): Promise<void>;
export {};
