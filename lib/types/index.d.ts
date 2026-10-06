import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "round-table";
export declare const inject: string[];
export interface Config {
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, _config: Config): Promise<void>;
