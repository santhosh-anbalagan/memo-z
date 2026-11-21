export interface EntryHeader {
  title: string;
  date: string;
  time_zone: string;
}

export const blockTypes = ["paragraph", "heading", "bullet"] as const;
export type BlockType = typeof blockTypes[number];

export interface JournalBlock {
  type: BlockType;
  text: string;
}

export interface JournalDocument {
  version: 1;
  blocks: JournalBlock[];
}

export function readHeader(value: unknown): EntryHeader {
  const header = value as Partial<EntryHeader> | null;
  if (!header || typeof header.title !== "string" || typeof header.date !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(header.date) || localDate(fromDate(header.date)) !== header.date
    || typeof header.time_zone !== "string") {
    throw new Error("The entry header could not be opened.");
  }
  return { title: header.title, date: header.date, time_zone: header.time_zone };
}

export function readDocument(value: unknown): JournalDocument {
  const document = value as Partial<JournalDocument> | null;
  if (!document || document.version !== 1 || !Array.isArray(document.blocks)
    || document.blocks.some(block => !block || !blockTypes.includes(block.type) || typeof block.text !== "string")) {
    throw new Error("This entry uses an unsupported document format.");
  }
  return { version: 1, blocks: document.blocks };
}

export function localDate(today = new Date()): string {
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export function fromDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}
