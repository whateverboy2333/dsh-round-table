import type { Meeting } from './meetings.ts';
import type { WorkflowNode, WorkflowCardBinding } from './workflow-types.ts';
/** Provenance only: no text/LLM classifier. A preparation reply is not execution
 * approval, even if the node separately requests a human start confirmation. */
export declare function workflowDraftWarnings(m: Meeting, items: {
    node: WorkflowNode;
    messageIds: string[];
}[]): string[];
export declare function approvedWorkflowCard(m: Meeting, binding: WorkflowCardBinding): {
    id: string;
    publicationId: string;
    publishedAt: number | undefined;
    messageIds: string[];
    assetIds: string[];
    fileRef: {
        fileId: string;
        relativePath: string;
        sha256: string;
        version: number;
    };
    cardId: string;
    version: number;
    title: string;
    body: string;
    generatorSessionId: string;
    generatorName?: string;
    assigneeName?: string;
    assigneeSessionId?: string;
    assetVersions?: {
        id: string;
        version: number;
        sha256: string;
    }[];
    fileId?: string;
    relativePath?: string;
    sha256?: string;
    releaseId?: string;
};
export declare function bindWorkflowCard(m: Meeting, node: WorkflowNode, binding: WorkflowCardBinding): WorkflowNode;
/** Validate the exact approved bytes before reserving a task. The stored body is
 * a frozen authored snapshot; unreadable/edited files are never silently used. */
export declare function verifyWorkflowCards(m: Meeting, nodeIds: string[], nodes: WorkflowNode[]): Promise<void>;
