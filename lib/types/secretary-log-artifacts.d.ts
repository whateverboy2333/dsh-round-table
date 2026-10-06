/** Validate every supported artifact before the caller disposes or deletes anything. */
export declare function collectSecretaryLogArtifacts(home: string, id: string, currentPath: string): Promise<string[]>;
/** Call only after owned handle disposal and persistence retirement have settled. */
export declare function deleteSecretaryLogArtifacts(home: string, id: string, currentPath: string): Promise<void>;
