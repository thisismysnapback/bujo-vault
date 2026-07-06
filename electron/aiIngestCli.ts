import { ingestRawAiInput, type AiIngestResult } from './aiIngest'

export async function runAiIngestCli(options: { date: string; text: string; vaultPath?: string; mode?: 'parse' | 'single-note'; replaceDate?: boolean }): Promise<AiIngestResult> {
  return ingestRawAiInput(options)
}
