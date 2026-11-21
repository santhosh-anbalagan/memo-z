import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, exclusive, MemoApi } from "./api.js";
import type { Account, EntryMutation, EntrySummary, Revision } from "./api.js";
import { readDocument, readHeader } from "./journal.js";
import type { EntryHeader, JournalDocument } from "./journal.js";
import { clearPending, enqueue, pendingEntries } from "./outbox.js";
import type { PendingEntry } from "./outbox.js";
import { recordPurpose, seal, unseal } from "./vault.js";

export type JournalRow = EntryHeader & {
  id: string;
  revisionId: string;
  updatedAt: string;
  pending: boolean;
};

export interface EditorEntry {
  id: string;
  base: string | null;
  header: EntryHeader;
  document: JournalDocument;
  conflicts: Revision[];
  pending: boolean;
  dirty: boolean;
  resolves?: string;
}

type Acknowledgement = { revision_id: string; conflict: boolean };

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || (error instanceof Error && !(error instanceof TypeError))
    ? error.message : fallback;
}

export function useJournal(api: MemoApi, account: Account, vaultKey: CryptoKey) {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [acknowledgements, setAcknowledgements] = useState<Record<string, Acknowledgement>>({});
  const remote = useRef<EntrySummary[]>([]);
  const mounted = useRef(true);
  const running = useRef(false);
  const rerun = useRef(false);

  const refreshRows = useCallback(async (queued: PendingEntry[]) => {
    const entries = new Map(remote.current.map(row => [row.id, { ...row, pending: false }]));
    for (const item of queued) {
      entries.set(item.entryId, {
        id: item.entryId, revision_id: item.change.mutation_id, updated_at: item.queuedAt,
        header: item.change.header, pending: true,
      });
    }
    const opened = await Promise.allSettled([...entries.values()].map(async item => ({
      ...readHeader(await unseal(vaultKey, item.header, recordPurpose(item.id, item.revision_id, "header"))),
      id: item.id, revisionId: item.revision_id, updatedAt: item.updated_at, pending: item.pending,
    })));
    if (mounted.current) {
      setRows(opened.flatMap(result => result.status === "fulfilled" ? [result.value] : [])
        .sort((first, second) => second.date.localeCompare(first.date) || second.updatedAt.localeCompare(first.updatedAt)));
      setPending(queued.length);
    }
    return opened.some(result => result.status === "rejected");
  }, [vaultKey]);

  const synchronize = useCallback(async () => {
    if (!mounted.current) return;
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    setSyncing(true);
    let messages: string[] = [];
    let alternate = false;
    try {
      do {
        rerun.current = false;
        messages = [];
        await refreshRows(await pendingEntries(account.id));
        try {
          await exclusive(`memo-z-outbox:${account.id}`, async () => {
            for (const item of await pendingEntries(account.id)) {
              if (!mounted.current) return;
              const result = await api.save(account.id, item.entryId, item.change);
              await clearPending(item.id);
              alternate ||= result.conflict;
              if (mounted.current) setAcknowledgements(previous => ({ ...previous, [item.entryId]: result }));
            }
          });
          if (mounted.current) remote.current = await api.list(account.id);
        } catch (error) {
          messages.push(errorMessage(error, "Cloud sync is unavailable. Reconnect to retry or open older entries."));
        }
        if (mounted.current && await refreshRows(await pendingEntries(account.id))) {
          messages.push("An entry could not be unlocked.");
        }
      } while (mounted.current && rerun.current);
    } catch {
      messages.push("The encrypted draft queue is unavailable.");
    } finally {
      running.current = false;
      if (mounted.current) {
        if (alternate) messages.push("An alternate version was saved. Reopen the entry to review it.");
        setNotice(messages.join(" "));
        setSyncing(false);
      }
    }
  }, [account.id, api, refreshRows]);

  useEffect(() => {
    mounted.current = true;
    const handleSync = () => { void synchronize(); };
    handleSync();
    window.addEventListener("online", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [synchronize]);

  async function openRevision(entryId: string, revision: Revision) {
    const [header, body] = await Promise.all([
      unseal(vaultKey, revision.header, recordPurpose(entryId, revision.id, "header")),
      unseal(vaultKey, revision.body, recordPurpose(entryId, revision.id, "body")),
    ]);
    return { header: readHeader(header), document: readDocument(body) };
  }

  async function openEntry(id: string): Promise<EditorEntry> {
    const queued = (await pendingEntries(account.id)).filter(item => item.entryId === id).at(-1);
    const result = queued ? {
      current: { id: queued.change.mutation_id, header: queued.change.header, body: queued.change.body, saved_at: queued.queuedAt },
      conflicts: [],
    } : await api.entry(account.id, id);
    return {
      id, base: result.current.id, ...await openRevision(id, result.current),
      conflicts: result.conflicts, pending: !!queued, dirty: false, resolves: queued?.change.resolves,
    };
  }

  async function save(entry: EditorEntry) {
    const mutation = crypto.randomUUID();
    const header = { ...entry.header, title: entry.header.title.trim() };
    const [protectedHeader, protectedBody] = await Promise.all([
      seal(vaultKey, header, recordPurpose(entry.id, mutation, "header")),
      seal(vaultKey, entry.document, recordPurpose(entry.id, mutation, "body")),
    ]);
    if (protectedBody.data.length > 350_000) throw new Error("This entry is too large. Shorten it and try again.");
    const change: EntryMutation = {
      mutation_id: mutation, base_revision: entry.base, header: protectedHeader, body: protectedBody, resolves: entry.resolves,
    };
    await enqueue(account, entry.id, change);
    void synchronize();
    return { ...entry, header, base: mutation, pending: true, dirty: false, resolves: undefined };
  }

  return { rows, pending, syncing, notice, acknowledgements, synchronize, openEntry, openRevision, save };
}
