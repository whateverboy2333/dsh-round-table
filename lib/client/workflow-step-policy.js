export const STEP_POLICY = 'per-node-v1';
/** A future draft only: never alter an existing run or imply execution. */
export function stepPolicyDraft(definition) { const known = definition.executionPolicy === STEP_POLICY; return { ...definition, executionPolicy: STEP_POLICY, nodes: definition.nodes.map(node => ({ ...node, autoReceiveAndRun: known ? node.autoReceiveAndRun === true : false })) }; }
