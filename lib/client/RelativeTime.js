import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { relativeTime } from "./relative-time.js";
/** One clock per visible panel, shared by all its timestamp labels. */
export function useRelativeNow() {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
    return now;
}
export function RelativeTime({ timestamp, now }) {
    const value = relativeTime(timestamp, now);
    return _jsx("time", { "data-relative-time": timestamp, dateTime: value.dateTime, title: value.title, "aria-label": `${value.label}，${value.title}`, children: value.label });
}
