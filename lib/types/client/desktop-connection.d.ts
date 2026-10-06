import type { RoundTableConnection } from './MeetingPanel.tsx';
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client';
/** 0.2 Remote calls return Result directly; the 0.1 wire adapter wrapped it. */
export declare function desktopConnection(remote: ClientRemote): RoundTableConnection;
