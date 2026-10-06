/** Presentation only: original timestamps remain unchanged for audit and sorting. */
export declare function relativeTime(timestamp: number, now?: number): {
    label: string;
    title: string;
    dateTime?: string;
};
