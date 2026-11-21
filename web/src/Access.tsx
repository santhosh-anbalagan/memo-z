import { Alert, Button, CircularProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ApiError, MemoApi } from "./api.js";
import type { Account } from "./api.js";
import { Brand, Icon } from "./icons.js";
import { pendingEntries } from "./outbox.js";
import { newVault, unlockVault } from "./vault.js";
import { Workspace } from "./Workspace.js";

type AccessState =
  | { screen: "loading" }
  | { screen: "unsupported" }
  | { screen: "auth" }
  | { screen: "unlock"; account: Account }
  | { screen: "recover"; account: Account; key: CryptoKey; recoveryKey: string }
  | { screen: "journal"; account: Account; key: CryptoKey };

function Gate({ children, demo }: { children: ReactNode; demo: boolean }) {
  return (
    <main className="auth-page">
      <Paper className="auth-layout" variant="outlined">
        <section className="auth-brand" aria-label="About Memo Z">
          <Brand />
          <div className="auth-intro">
            <span className="auth-journal-icon"><Icon name="brand" /></span>
            <Typography component="p" variant="h1">Your private journal</Typography>
            <p>Write by day. Unlock your entries with your recovery key.</p>
          </div>
        </section>
        <section className="auth-card">
          {children}
          {demo && <p className="demo-notice">Local demo. Use sample entries. The journal resets when the server stops.</p>}
        </section>
      </Paper>
    </main>
  );
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function Access() {
  const [api] = useState(() => new MemoApi());
  const [state, setState] = useState<AccessState>({ screen: "loading" });
  const [demo, setDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [offlineAccounts, setOfflineAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!globalThis.crypto?.subtle) {
      setState({ screen: "unsupported" });
      return;
    }
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    void fetch("/api/health", { cache: "no-store" }).then(response => response.json()).then(status => {
      setDemo(status.storage === "memory");
    }).catch(() => undefined);
    void api.refresh().then(
      account => setState({ screen: "unlock", account }),
      error => {
        if (!(error instanceof ApiError && error.status === 401)) setMessage("Cloud sign-in is unavailable. Pending drafts can still be unlocked here.");
        setState({ screen: "auth" });
      },
    );
  }, [api]);

  useEffect(() => {
    if (state.screen !== "auth") return;
    let mounted = true;
    void pendingEntries().then(items => {
      if (!mounted) return;
      setOfflineAccounts([...new Map(items.map(item => [item.account.id, item.account])).values()]);
    }).catch(() => { if (mounted) setOfflineAccounts([]); });
    return () => { mounted = false; };
  }, [state.screen]);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const username = String(fields.get("username")).trim();
    const password = String(fields.get("password"));
    setBusy(true);
    setMessage("");
    try {
      const generated = creating ? await newVault() : null;
      const account = await api.signIn(username, password, generated?.vault);
      setState(generated ? {
        screen: "recover", account, key: generated.key, recoveryKey: generated.recoveryKey,
      } : { screen: "unlock", account });
    } catch (error) {
      setMessage(messageOf(error, "Cannot reach Memo Z. Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  async function unlock(event: FormEvent<HTMLFormElement>, account: Account) {
    event.preventDefault();
    const recovery = String(new FormData(event.currentTarget).get("recovery"));
    setBusy(true);
    setMessage("");
    try {
      const key = await unlockVault(account.vault, recovery);
      setState({ screen: "journal", account, key });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That key could not unlock this journal.");
    } finally {
      setBusy(false);
    }
  }

  function showSignIn() {
    setCreating(false);
    setMessage("");
    setState({ screen: "auth" });
  }

  if (state.screen === "journal") {
    return (
      <Workspace
        key={state.account.id}
        api={api}
        account={state.account}
        vaultKey={state.key}
        demo={demo}
        onLock={() => { setMessage(""); setState({ screen: "unlock", account: state.account }); }}
        onSignOut={async () => { await api.signOut(); showSignIn(); }}
      />
    );
  }

  return (
    <Gate demo={demo}>
      {state.screen === "loading" && <Stack direction="row" spacing={2} alignItems="center" role="status"><CircularProgress size={20} /> <span>Opening your journal…</span></Stack>}
      {state.screen === "unsupported" && <Alert severity="error">Open Memo Z over HTTPS or at its local demo address.</Alert>}
      {state.screen === "auth" && <>
        <Typography component="h1" variant="h1">{creating ? "Create account" : "Sign in"}</Typography>
        {message && <Alert severity="info" role="status">{message}</Alert>}
        <Stack component="form" spacing={2} onSubmit={submitAccount} key={String(creating)}>
          <TextField label="Username" name="username" autoComplete="username" required fullWidth
            slotProps={{ htmlInput: { minLength: 3, maxLength: 40, pattern: "[A-Za-z0-9_.\\-]+" } }} />
          <TextField label="Password" name="password" type="password" required fullWidth
            autoComplete={creating ? "new-password" : "current-password"}
            helperText={creating ? "Use at least 12 characters." : undefined}
            slotProps={{ htmlInput: { minLength: 12, maxLength: 256 } }} />
          <Button variant="contained" type="submit" size="large" disabled={busy}>{creating ? "Create account" : "Sign in"}</Button>
        </Stack>
        <Button className="auth-switch" disabled={busy} onClick={() => { setCreating(value => !value); setMessage(""); }}>
          {creating ? "Back to sign in" : "Create an account"}
        </Button>
        {!!offlineAccounts.length && <div className="offline-accounts">
          <Typography variant="body2" color="text.secondary">Pending drafts on this browser</Typography>
          {offlineAccounts.map(account => (
            <Button key={account.id} onClick={() => { setMessage(""); setState({ screen: "unlock", account }); }}>{account.username}</Button>
          ))}
        </div>}
      </>}
      {state.screen === "unlock" && <>
        <Typography component="h1" variant="h1">Unlock your journal</Typography>
        <Typography color="text.secondary">{state.account.username}</Typography>
        {message && <Alert severity="warning" role="status">{message}</Alert>}
        <Stack component="form" spacing={2} onSubmit={event => void unlock(event, state.account)}>
          <TextField label="Recovery key" name="recovery" type="password" autoComplete="off" required fullWidth slotProps={{ htmlInput: { spellCheck: false } }} />
          <Button type="submit" size="large" variant="contained" disabled={busy}>Unlock journal</Button>
        </Stack>
        <Button className="auth-switch" disabled={busy} onClick={showSignIn}>Switch account</Button>
      </>}
      {state.screen === "recover" && <>
        <Typography component="h1" variant="h1">Save your recovery key</Typography>
        <Typography color="text.secondary">Save it somewhere private. You’ll need it to unlock your journal on another device or after closing this page.</Typography>
        <output className="recovery-key">{state.recoveryKey}</output>
        {message && <Typography role="status" variant="body2">{message}</Typography>}
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => void navigator.clipboard.writeText(state.recoveryKey).then(
            () => setMessage("Recovery key copied."), () => setMessage("Select and copy the displayed key."),
          )}>Copy key</Button>
          <Button variant="contained" onClick={() => setState({ screen: "journal", account: state.account, key: state.key })}>I’ve saved it</Button>
        </Stack>
      </>}
    </Gate>
  );
}
