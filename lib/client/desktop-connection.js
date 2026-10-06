/** 0.2 Remote calls return Result directly; the 0.1 wire adapter wrapped it. */
export function desktopConnection(remote) {
    return { homePath: () => remote.$host?.home, api: {
            sessions: { create: async (input) => ({ result: await remote.session.create(input) }), rename: async (input) => ({ result: await remote.session.rename(input) }) },
            workspace: { list: async () => {
                    const stream = remote.workspace.follow(AbortSignal.timeout(10000)), iterator = stream[Symbol.asyncIterator]();
                    try {
                        const first = await iterator.next();
                        if (first.done || first.value.type !== 'baseline')
                            throw new Error('工作区名册尚未就绪');
                        return { result: { ok: true, value: { items: [...first.value.value.items] } } };
                    }
                    finally {
                        await iterator.return?.();
                    }
                } },
            agentPresets: { list: async () => { const result = await remote.agentPresets.list(); return { result: result.ok ? { ok: true, value: { presets: [...result.value.presets] } } : result }; } },
        } };
}
