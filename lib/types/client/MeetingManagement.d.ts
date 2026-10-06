export declare function MeetingManagement({ meeting, onChanged, onDeleted }: {
    meeting: {
        meetingId: string;
        title: string;
        description?: string;
        archivedAt?: number;
        minutesSource?: 'formal' | 'session';
        secretaryTitleError?: string;
        deletion?: {
            error?: string;
            notify?: boolean;
        };
    };
    onChanged: () => Promise<void>;
    onDeleted: (message: string) => void;
}): React.ReactNode;
