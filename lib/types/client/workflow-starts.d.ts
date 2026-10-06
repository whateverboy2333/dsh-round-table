import type { WorkflowDefinition } from '../workflow-types.ts';
export declare function simpleWorkflow(kind: 'sequence' | 'parallel', members: {
    id: string;
    name: string;
}[], id: string): WorkflowDefinition;
