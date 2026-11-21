import type { Account, EntryMutation } from "./api.js";

export interface PendingEntry {
  id: number;
  queuedAt: string;
  account: Account;
  entryId: string;
  change: EntryMutation;
}

let database: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("memo-z-drafts", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const current = db.transaction("pending", mode);
    const request = run(current.objectStore("pending"));
    current.oncomplete = () => resolve(request.result);
    current.onabort = current.onerror = () => reject(current.error ?? request.error);
  });
}

export async function pendingEntries(accountId?: string): Promise<PendingEntry[]> {
  const pending = await transaction("readonly", store => store.getAll()) as PendingEntry[];
  return accountId ? pending.filter(item => item.account.id === accountId) : pending;
}

export function enqueue(account: Account, entryId: string, change: EntryMutation) {
  return transaction("readwrite", store => store.add({
    account: { id: account.id, username: account.username, vault: account.vault },
    entryId, change, queuedAt: new Date().toISOString(),
  }));
}

export function clearPending(id: number) {
  return transaction("readwrite", store => store.delete(id));
}
