import { useEffect, useRef, useState } from 'react';
import { localScopeId, scopedLocal } from "./ui-state.js";
/** The server receipt means accepted, not that every original member received it. */
export function useCardGeneration(meetingId, onChanged, onOpen) {
    const scope = useRef(localScopeId()).current, ownerMeeting = useRef(meetingId).current, currentMeeting = useRef(meetingId), alive = useRef(true), { readLocal, writeLocal, meetingCall } = scopedLocal(scope), key = `card-generation-request.${ownerMeeting}`;
    currentMeeting.current = meetingId;
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const current = () => alive.current && scope === localScopeId() && currentMeeting.current === ownerMeeting;
    const [pending, setPending] = useState(() => readLocal(key, undefined)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const guard = useRef(false);
    const finish = async (request) => {
        if (guard.current || !current())
            return;
        guard.current = true;
        setBusy(true);
        setError('');
        let outcome = request;
        const remember = (value) => { outcome = value; if (current())
            setPending(value); return writeLocal(key, value); };
        try {
            if (!outcome.stage) {
                await meetingCall(ownerMeeting, 'task-card-generate', outcome);
                remember({ ...outcome, stage: 'accepted' });
            }
            if (!writeLocal(key, undefined))
                throw Error('原请求结果已明确，但本地记录未能清理；请保留原请求，仅重试本地清理');
            if (current()) {
                setPending(undefined);
                setNotice(outcome.stage === 'rejected' ? '原生成请求明确未提交，现可调整原稿。' : '生成请求已记录；在任务卡列表查看逐成员投递和回应。当前讨论草稿保留，生成与修改不执行工作。');
                if (outcome.stage !== 'rejected') {
                    onOpen();
                    try {
                        await onChanged();
                    }
                    catch {
                        if (current())
                            setError('生成请求已接受，刷新失败；请刷新查看卡片，勿另发同次请求。');
                    }
                }
            }
        }
        catch (e) {
            const x = e;
            if (x.requestState === 'rejected') {
                remember({ ...outcome, stage: 'rejected' });
                if (writeLocal(key, undefined) && current())
                    setPending(undefined);
            }
            if (current())
                setError(x.message + (x.requestState === 'rejected' ? '' : '；原请求保留，只核对或重试此请求'));
        }
        finally {
            guard.current = false;
            if (current())
                setBusy(false);
        }
    };
    const begin = (draft) => {
        if (guard.current || pending || !current())
            return;
        if (!draft.recipientIds.length) {
            setError('请先在讨论输入区 @ 选择至少一位原成员，再点击任务卡生成；额外正文可以留空。');
            return;
        }
        const request = { requestId: crypto.randomUUID(), recipientIds: [...draft.recipientIds], instruction: draft.instruction, messageIds: [...draft.messageIds], assetIds: [...draft.assetIds] };
        if (!writeLocal(key, request)) {
            setError('本地请求无法保存，尚未发送，请保留当前草稿。');
            return;
        }
        setPending(request);
        void finish(request);
    };
    return { pending, busy, error, notice, begin, retry: () => pending && void finish(pending) };
}
