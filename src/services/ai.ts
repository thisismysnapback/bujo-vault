import { EntryType } from "../types";
import { getDesktopApi } from './desktop';

export async function parseDump(dumpText: string, logDate?: string): Promise<{ type: EntryType; content: string }[]> {
  const api = getDesktopApi();
  if (api) {
    const results = await api.smartParse(dumpText, logDate);
    return results.map(([type, content]) => ({ type: type as EntryType, content }));
  }

  throw new Error("AI parsing is only available in the desktop app.");
}
