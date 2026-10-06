/** Only physical generations owned by one exact secretary may be permanently removed. */
import { lstat, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, join } from 'node:path';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
const supportedName = /^session(?:\.v([0-4]))?\.jsonl(?:\.(zstd|gz))?$/;
const secretaryId = /^round-table-secretary-[0-9a-f-]{36}$/;
function inside(base, path) { const rel = relative(base, path); return !!rel && !rel.startsWith('..') && !isAbsolute(rel); }
async function exactDirectory(home, id, currentPath) {
    if (!secretaryId.test(id))
        throw new Error('秘书身份不符合专属日志约束，拒绝删除');
    const base = resolve(home), directory = dirname(resolve(currentPath));
    if (!inside(base, directory) || basename(directory) !== id || !supportedName.test(basename(currentPath)))
        throw new Error('秘书日志不在专属身份目录或命名不受支持，拒绝删除');
    const actualBase = await realpath(base);
    if (actualBase !== base)
        throw new Error('DSH_HOME包含链接，拒绝删除秘书日志');
    // Check every existing ancestor even when an unmaterialized log directory is absent.
    let cursor = directory;
    while (inside(base, cursor)) {
        const stat = await lstat(cursor).catch((error) => { if (error.code === 'ENOENT')
            return undefined; throw error; });
        if (stat && (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(cursor) !== cursor))
            throw new Error('秘书日志目录包含链接或不是普通目录');
        cursor = dirname(cursor);
    }
    const stat = await lstat(directory).catch((error) => { if (error.code === 'ENOENT')
        return undefined; throw error; });
    return stat ? directory : undefined;
}
/** Parse the first Zstandard frame boundary without interpreting subsequent body frames. */
function firstZstdFrame(bytes) {
    if (bytes.length < 5 || bytes.readUInt32LE(0) !== 0xfd2fb528)
        throw new Error('秘书日志Zstandard头帧非法');
    const descriptor = bytes[4], single = !!(descriptor & 0x20);
    if (descriptor & 0x18)
        throw new Error('秘书日志Zstandard保留位非法');
    let offset = 5 + (single ? 0 : 1) + [0, 1, 2, 4][descriptor & 3] + [single ? 1 : 0, 2, 4, 8][descriptor >>> 6];
    if (offset > bytes.length)
        throw new Error('秘书日志Zstandard帧头不完整');
    for (;;) {
        if (offset + 3 > bytes.length)
            throw new Error('秘书日志Zstandard块头不完整');
        const block = bytes.readUIntLE(offset, 3), kind = (block >>> 1) & 3;
        if (kind === 3)
            throw new Error('秘书日志Zstandard块类型非法');
        offset += 3 + (kind === 1 ? 1 : block >>> 3);
        if (offset > bytes.length)
            throw new Error('秘书日志Zstandard块不完整');
        if (block & 1)
            break;
    }
    if (descriptor & 4)
        offset += 4;
    if (offset > bytes.length)
        throw new Error('秘书日志Zstandard校验和不完整');
    return bytes.subarray(0, offset);
}
async function validateArtifact(home, id, path) {
    const base = resolve(home), absolute = resolve(path), directory = await exactDirectory(home, id, path);
    if (!directory || dirname(absolute) !== directory)
        throw new Error('秘书日志目录已变化，拒绝删除');
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        throw new Error('秘书日志不是无链接的普通文件，拒绝删除');
    const actual = await realpath(absolute);
    if (actual !== absolute || !inside(base, actual))
        throw new Error('秘书日志路径越界或包含链接');
    const filename = basename(absolute), match = supportedName.exec(filename);
    if (!match)
        throw new Error('未知秘书日志代际命名，拒绝删除');
    const bytes = await readFile(absolute);
    let decoded;
    try {
        decoded = filename.endsWith('.zstd') ? zstdDecompressSync(firstZstdFrame(bytes), { maxOutputLength: 32 * 1024 * 1024 }) : filename.endsWith('.gz') ? gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }) : bytes;
    }
    catch (error) {
        throw new Error('秘书日志物理头解码失败，拒绝删除', { cause: error });
    }
    const newline = decoded.indexOf(10), firstLine = decoded.subarray(0, newline < 0 ? decoded.length : newline);
    if (!firstLine.length || firstLine.length > 64 * 1024)
        throw new Error('秘书日志物理头长度非法');
    let header;
    try {
        header = JSON.parse(firstLine.toString('utf8'));
    }
    catch (error) {
        throw new Error('秘书日志物理头JSON非法，拒绝删除', { cause: error });
    }
    const value = header;
    if (!value || value.type !== 'session' || !Number.isInteger(value.version) || Number(value.version) < 0 || Number(value.version) > 4)
        throw new Error('秘书日志物理头版本未知或不支持，拒绝删除');
    if (value.id !== id)
        throw new Error('秘书日志物理头身份不同，拒绝删除所有代际文件');
    if (match[1] !== undefined && Number(match[1]) !== value.version)
        throw new Error('秘书日志文件代际与物理头版本不同，拒绝删除');
    const after = await lstat(absolute);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1 || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || await realpath(absolute) !== absolute)
        throw new Error('秘书日志在身份核验期间发生变化，拒绝删除');
}
/** Validate every supported artifact before the caller disposes or deletes anything. */
export async function collectSecretaryLogArtifacts(home, id, currentPath) {
    const directory = await exactDirectory(home, id, currentPath);
    if (!directory)
        return [];
    const names = await readdir(directory);
    const unknown = names.find(name => /^session\.v\d+(?:\.|$)/.test(name) && !supportedName.test(name));
    if (unknown)
        throw new Error(`未知秘书日志代际 ${unknown}，拒绝删除`);
    const paths = names.filter(name => supportedName.test(name)).sort().map(name => join(directory, name));
    for (const path of paths)
        await validateArtifact(home, id, path);
    return paths;
}
/** Call only after owned handle disposal and persistence retirement have settled. */
export async function deleteSecretaryLogArtifacts(home, id, currentPath) {
    // Repeat the whole inventory validation before the first unlink, including files
    // published by the host's final retirement. Then revalidate each exact target.
    const paths = await collectSecretaryLogArtifacts(home, id, currentPath);
    for (const path of paths) {
        await validateArtifact(home, id, path);
        await unlink(path);
    }
}
