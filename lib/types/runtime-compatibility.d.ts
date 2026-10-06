/** Exact API versions verified by this release; an untested rc is not a compatibility claim. */
export declare const TESTED_RUNTIME_VERSIONS: Readonly<Record<string, string>>;
export declare function runtimeCompatibilityProblems(versions: Record<string, string | undefined>): string[];
