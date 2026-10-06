/** Grants extend only cumulative starts. Per-member per-round retry limits stay intact. */
export function workflowBudget(run) {
    return { workAttempts: run.definition.limits.workAttempts + (run.budgetGrants ?? []).reduce((n, g) => n + g.work, 0), minutesStarts: run.definition.limits.minutesStarts + (run.budgetGrants ?? []).reduce((n, g) => n + g.minutes, 0) };
}
