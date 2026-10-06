import type { MeetingAsset } from '../meeting-flow-types.ts';
export declare const ACCEPTED_MEETING_FILES = ".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.diff,.patch,.yaml,.yml,.log,.html,.css,.xml,.sql,.png,.jpg,.jpeg,.webp";
export declare function ComposerAttachments({ meetingId, disabled, onUploaded, onBlockingChange, register }: {
    meetingId: string;
    disabled?: boolean;
    onUploaded: (asset: MeetingAsset) => void;
    onBlockingChange: (blocked: boolean) => void;
    register: (receive: (files: File[]) => void) => void;
}): React.ReactNode;
