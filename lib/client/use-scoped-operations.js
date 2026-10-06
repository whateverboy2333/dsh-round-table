import { useEffect, useRef } from 'react';
import { localScopeId, scopedLocal } from "./ui-state.js";
/** An async operation keeps its original owner through waits and component disposal. */
export function useScopedOperations() {
    const scope = useRef(localScopeId()).current, alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const local = scopedLocal(scope), isCurrent = () => alive.current && !!scope && scope === localScopeId();
    const meetingCall = (id, action, body = {}) => {
        if (!isCurrent())
            return Promise.reject(Object.assign(Error('DSH 实例已变化或页面已关闭，请重新打开原会议'), { status: 409, requestState: 'rejected' }));
        return local.meetingCall(id, action, body);
    };
    return { meetingCall, isCurrent };
}
