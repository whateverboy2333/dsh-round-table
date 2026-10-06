import type { WorkflowDefinition, WorkflowNode, WorkflowRun } from '../workflow-types.ts';
import type { MeetingMessage, MeetingAsset } from '../meeting-flow-types.ts';
export declare function WorkflowInspector({ definition, node, members, messages, assets, run, readOnly, view, onChange, onRemove }: {
    definition: WorkflowDefinition;
    node: WorkflowNode;
    members: {
        id: string;
        name: string;
    }[];
    messages: MeetingMessage[];
    assets: MeetingAsset[];
    run?: WorkflowRun;
    readOnly?: boolean;
    view?: 'sequence' | 'graph';
    onChange: (n: WorkflowNode) => void;
    onRemove: () => void;
}): React.ReactNode;
