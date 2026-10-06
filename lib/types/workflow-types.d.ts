/** Persisted/wire-only workflow contract. The ReleaseTask remains the execution authority. */
export type WorkflowInput = {
    kind: 'message';
    id: string;
} | {
    kind: 'asset';
    id: string;
} | {
    kind: 'node';
    nodeId: string;
    round: 'current' | 'previous';
} | {
    kind: 'activation';
    activationId: string;
};
export interface WorkflowCardBinding {
    publicationId: string;
    cardId: string;
    version: number;
    fileId: string;
    sha256: string;
}
export declare function isWorkflowCardBinding(x: unknown): x is WorkflowCardBinding;
export interface WorkflowNode {
    id: string;
    title: string;
    kind: 'work' | 'join' | 'minutes';
    memberIds: string[];
    instruction: string;
    inputs: WorkflowInput[];
    includeIncoming: boolean;
    decision?: boolean;
    requireReview?: boolean;
    confirmation?: boolean;
    autoReceiveAndRun?: boolean;
    cardBinding?: WorkflowCardBinding;
    stepsInternal?: 'entry' | 'join';
}
export interface WorkflowEdge {
    id: string;
    from: string;
    to: string;
    kind: 'flow' | 'choice' | 'loop';
    label?: string;
    loopId?: string;
}
export interface ParallelGroup {
    id: string;
    sourceId: string;
    branchIds: string[];
    joinId: string;
}
/** maxRounds is retained for old snapshots; manually authorized loops do not enforce it. */
export interface LoopGroup {
    id: string;
    nodeIds: string[];
    entryIds: string[];
    gateId: string;
    advanceId: string;
    maxRounds: number;
}
export interface WorkflowBudgetGrant {
    requestId: string;
    work: number;
    minutes: number;
    createdAt: number;
}
export interface WorkflowLimits {
    nodeAttempts: number;
    workAttempts: number;
    minutesStarts: number;
}
export interface WorkflowStepStage {
    id: string;
    nodeIds: string[];
}
export interface WorkflowStepsLayout {
    version: 1;
    stages: WorkflowStepStage[];
}
export interface WorkflowDefinition {
    executionPolicy?: 'per-node-v1';
    steps?: WorkflowStepsLayout;
    id: string;
    revision: number;
    title: string;
    entryId: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    parallelGroups: ParallelGroup[];
    loops: LoopGroup[];
    limits: WorkflowLimits;
    layoutRevision: number;
    positions: Record<string, {
        x: number;
        y: number;
    }>;
}
export interface WorkflowBinding {
    runId: string;
    activationId: string;
    reservedDeliveries: number;
}
export interface WorkflowActivation {
    id: string;
    nodeId: string;
    slotKey: string;
    round: number;
    loopId?: string;
    attempt: number;
    definitionRevision: number;
    node: WorkflowNode;
    createdAt: number;
    requestId: string;
    requestHash: string;
    inputFingerprint: string;
    messageIds: string[];
    assetIds: string[];
    sourceActivationIds: string[];
    incomingEdgeIds: string[];
    releaseId?: string;
    minutesJobId?: string;
    minutesId?: string;
    minutesError?: string;
    minutesStatus?: 'reserved' | 'running' | 'completed' | 'failed' | 'cancelled';
    minutesInput?: {
        title: string;
        description: string;
        memberIds: string[];
        memberRoles: Record<string, string>;
        messages: import('./meeting-flow-types.ts').MeetingMessage[];
        assets: import('./meeting-flow-types.ts').MeetingAsset[];
        context?: {
            activationId: string;
            nodeId: string;
            title: string;
            round: number;
            definitionRevision: number;
            temporary?: boolean;
            revisionOfTaskId?: string;
            choice?: string;
            reason?: string;
            results?: {
                taskId: string;
                memberId: string;
                status: string;
                review: string;
                reviewNote?: string;
            }[];
        }[];
        omitted?: {
            activationId: string;
            title: string;
            round: number;
            reason: string;
        }[];
    };
    choiceEdgeId?: string;
    choiceReason?: string;
    skipped?: boolean;
    skipReason?: string;
    skipMode?: 'omit' | 'bypass';
    temporary?: boolean;
    revisionOfTaskId?: string;
}
export interface WorkflowAudit {
    id: string;
    time: number;
    action: string;
    activationId?: string;
    details: string;
}
export interface WorkflowFork {
    id: string;
    groupId: string;
    round: number;
    loopId?: string;
    branchIds: string[];
    sourceActivationIds: string[];
    activationIds: string[];
}
export interface WorkflowAutomatic {
    mode: 'automatic';
    authorizedAt: number;
    roundCaps: Record<string, number>;
    pauseReason?: string;
}
export interface WorkflowRun {
    executionPolicy?: 'per-node-v1';
    id: string;
    definition: WorkflowDefinition;
    status: 'active' | 'completed' | 'stopped';
    paused: boolean;
    createdAt: number;
    rounds: Record<string, number>;
    activations: WorkflowActivation[];
    workReserved: number;
    minutesStarted: number;
    events: WorkflowAudit[];
    pendingInputs?: Record<string, WorkflowInput[]>;
    forks?: WorkflowFork[];
    budgetGrants?: WorkflowBudgetGrant[];
    automatic?: WorkflowAutomatic;
}
export interface WorkflowState {
    schemaVersion: number;
    draft?: WorkflowDefinition;
    versions: WorkflowDefinition[];
    runs: WorkflowRun[];
}
export type WorkflowStatus = 'not_started' | 'not_walked' | 'waiting_inputs' | 'ready' | 'waiting_decision' | 'queued' | 'offline' | 'delivering' | 'uncertain' | 'in_progress' | 'submitted' | 'failed' | 'ended' | 'skipped' | 'limit' | 'waiting_review' | 'changes_requested';
export interface WorkflowNodeView {
    nodeId: string;
    slotKey: string;
    round: number;
    loopId?: string;
    status: WorkflowStatus;
    activationId?: string;
    missing: string[];
    messageIds: string[];
    assetIds: string[];
    sourceActivationIds: string[];
    incomingEdgeIds: string[];
    submitted: number;
    required: number;
}
export interface WorkflowPlan {
    runId?: string;
    definitionRevision: number;
    nodeIds: string[];
    fingerprint: string;
    ready: boolean;
    missing: string[];
    warnings?: string[];
    automaticWarnings?: string[];
    memberAvailability?: Record<string, {
        connected: boolean;
        busy: boolean;
    }>;
    items: {
        node: WorkflowNode;
        view: WorkflowNodeView;
        messageIds: string[];
        assetIds: string[];
        characters: number;
        sourceActivationIds: string[];
        incomingEdgeIds: string[];
    }[];
}
export interface GraphIssue {
    code: string;
    message: string;
    nodeId?: string;
    edgeId?: string;
}
export declare const workflowSchemaSupported: (version: number) => boolean;
export declare const DEFAULT_WORKFLOW_LIMITS: WorkflowLimits;
export declare const validWorkflowId: (x: unknown) => x is string;
/** Editing future authorization or restarting requires a separate whole-run resume. */
export declare const workflowNeedsExplicitResume: (r: WorkflowRun) => boolean;
