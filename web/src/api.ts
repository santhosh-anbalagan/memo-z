import type { Ciphertext } from "./vault.js";

export interface Account {
  id: string;
  username: string;
  vault: Ciphertext;
}

export interface Session extends Account {
  access_token: string;
}

export interface EntrySummary {
  id: string;
  revision_id: string;
  updated_at: string;
  header: Ciphertext;
}

export interface Revision {
  id: string;
  header: Ciphertext;
  body: Ciphertext;
  saved_at: string;
}

export interface EntryMutation {
  mutation_id: string;
  base_revision: string | null;
  header: Ciphertext;
  body: Ciphertext;
  resolves?: string;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "" }));
    const message = typeof payload.detail === "string" && payload.detail;
    throw new ApiError(response.status, message || "Check the details and try again.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function exclusive<T>(name: string, run: () => Promise<T>): Promise<T> {
  return navigator.locks ? await navigator.locks.request(name, run) : await run();
}

export class MemoApi {
  session: Session | null = null;
  private refreshPromise: Promise<Session> | null = null;

  private auth<T>(action: string, body?: object): Promise<T> {
    return request<T>(`/api/auth/${action}`, {
      method: "POST",
      headers: { "X-Memo-Z": "1" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async signIn(username: string, password: string, vault?: Ciphertext) {
    this.session = await exclusive("memo-z-session", () =>
      this.auth<Session>(vault ? "register" : "login", { username, password, vault }),
    );
    return this.session;
  }

  async refresh(expectedId?: string): Promise<Session> {
    if (!this.refreshPromise) {
      this.refreshPromise = exclusive("memo-z-session", () => this.auth<Session>("refresh"))
        .finally(() => { this.refreshPromise = null; });
    }
    const session = await this.refreshPromise;
    if (expectedId && expectedId !== session.id) {
      this.session = null;
      throw new ApiError(401, "The browser account changed. Sign in to sync these drafts.");
    }
    this.session = session;
    return session;
  }

  async signOut() {
    await exclusive("memo-z-session", () => this.auth<void>("logout"));
    this.session = null;
  }

  async read<T>(accountId: string, path: string, options: RequestInit = {}): Promise<T> {
    const current = this.session?.id === accountId ? this.session : await this.refresh(accountId);
    const withToken = (token: string) => request<T>(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}` },
    });
    try {
      return await withToken(current.access_token);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const next = this.session && this.session.id === accountId && this.session.access_token !== current.access_token
        ? this.session : await this.refresh(accountId);
      return withToken(next.access_token);
    }
  }

  list(accountId: string) {
    return this.read<EntrySummary[]>(accountId, "/api/entries");
  }

  entry(accountId: string, entryId: string) {
    return this.read<{ current: Revision; conflicts: Revision[] }>(accountId, `/api/entries/${entryId}`);
  }

  save(accountId: string, entryId: string, mutation: EntryMutation) {
    return this.read<{ revision_id: string; conflict: boolean }>(accountId, `/api/entries/${entryId}`, {
      method: "PUT",
      body: JSON.stringify(mutation),
    });
  }
}
