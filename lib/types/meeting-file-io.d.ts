import type { FileHandle } from 'node:fs/promises';
export declare const FILE_IO_BLOCK_BYTES: number;
export declare function guardOwnedFilePath(base: string, path: string, exists?: boolean): Promise<void>;
export declare function ensureOwnedDirectory(base: string, path: string): Promise<void>;
export declare function openOwnedFile(base: string, path: string, write?: boolean): Promise<FileHandle>;
export declare function hashFileHandle(fd: FileHandle): Promise<{
    size: number;
    sha256: string;
}>;
export declare function hashOwnedFile(base: string, path: string): Promise<{
    size: number;
    sha256: string;
}>;
export declare function copyOwnedFile(sourceBase: string, source: string, targetBase: string, target: string, expected: {
    size: number;
    sha256: string;
}): Promise<void>;
