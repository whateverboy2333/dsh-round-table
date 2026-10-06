import type { WorkflowDefinition } from '../workflow-types.ts';
export declare const STEP_POLICY: "per-node-v1";
/** A future draft only: never alter an existing run or imply execution. */
export declare function stepPolicyDraft(definition: WorkflowDefinition): WorkflowDefinition;
