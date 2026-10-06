export interface PresetWire {
    id: string;
    trust?: 'system' | 'user';
    name?: string;
    description?: string;
    broken?: string;
}
export interface WorkspaceWire {
    workspaceId: string;
    title: string;
    path: string;
    sessionIds?: readonly string[];
}
export interface KnightSelection {
    instanceId: string;
    presetId: string;
    title: string;
    presetName: string;
    role: string;
    workspaceId?: string;
}
export interface PresetApi {
    agentPresets: {
        list(input: {}): Promise<{
            result: ({
                ok: true;
                value: {
                    presets: PresetWire[];
                };
            } | {
                ok: false;
                error: {
                    message: string;
                };
            });
        }>;
    };
}
export declare function PresetKnightPicker({ api, workspaces, selected, onChange, followCurrentLabel }: {
    api: PresetApi;
    workspaces: readonly WorkspaceWire[];
    selected: readonly KnightSelection[];
    onChange: (next: KnightSelection[]) => void;
    followCurrentLabel?: string;
}): React.ReactNode;
