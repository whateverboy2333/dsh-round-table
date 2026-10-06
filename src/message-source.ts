/** Producer-owned provenance; rc.2 removed the generic plugin source kind. */
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'round-table': {kind:'round-table';plugin:'dsh-round-table'}
  }
}
export {}
