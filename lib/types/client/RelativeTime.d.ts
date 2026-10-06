/** One clock per visible panel, shared by all its timestamp labels. */
export declare function useRelativeNow(): number;
export declare function RelativeTime({ timestamp, now }: {
    timestamp: number;
    now: number;
}): React.ReactNode;
