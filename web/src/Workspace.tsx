import {
  Alert, Avatar, BottomNavigation, BottomNavigationAction, Button, ButtonBase, Chip,
  CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, InputBase, Paper, Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { Account, MemoApi, Revision } from "./api.js";
import { Calendar, fullDate } from "./Calendar.js";
import { EntryEditor } from "./EntryEditor.js";
import { Brand, Icon } from "./icons.js";
import { fromDate, localDate } from "./journal.js";
import { errorMessage, useJournal } from "./useJournal.js";
import type { EditorEntry, JournalRow } from "./useJournal.js";

type View = "today" | "journal" | "calendar" | "profile";
const navigation = [
  { value: "today", label: "Today", icon: "today" },
  { value: "journal", label: "All entries", icon: "entries" },
  { value: "calendar", label: "Calendar", icon: "calendar" },
  { value: "profile", label: "Profile", icon: "profile" },
] as const;
const sectionTitle = { today: "Today", journal: "All entries", calendar: "Calendar", profile: "Profile" };
const shortDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function JournalList({ entries, loading, query, singleDay, title, onOpen }: {
  entries: JournalRow[];
  loading: boolean;
  query: string;
  singleDay: boolean;
  title: string;
  onOpen: (entry: JournalRow) => void;
}) {
  return (
    <Paper variant="outlined" className="panel entries-panel" component="section">
      <div className="panel-heading">
        <Typography component="h2" variant="h2">{title}</Typography>
        <Chip size="small" label={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`} className="count-chip" />
      </div>
      {!entries.length && <div className="empty-state">
        {loading ? <CircularProgress size={28} aria-label="Loading entries" /> : <span className="empty-icon"><Icon name={query ? "search" : "entries"} /></span>}
        <Typography component="p" variant="h3">
          {loading ? "Opening your entries…" : query ? "No matching entries" : "No entries yet"}
        </Typography>
        {!loading && <Typography component="p" variant="body2" color="text.secondary">
          {query ? "Try a different title." : singleDay ? "Entries you write for this date will appear here." : "Create an entry to start your journal."}
        </Typography>}
      </div>}
      {!!entries.length && <ul className="entry-list">
        {entries.map(entry => <li key={entry.id}>
          <ButtonBase className="entry-row" onClick={() => onOpen(entry)}>
            <span className="entry-icon"><Icon name="entries" small /></span>
            <span className="entry-details"><strong>{entry.title || "Untitled entry"}</strong><span>{shortDate.format(fromDate(entry.date))}</span></span>
            {entry.pending && <Chip size="small" variant="outlined" label="Sync pending" />}
            <span className="entry-chevron"><Icon name="right" small /></span>
          </ButtonBase>
        </li>)}
      </ul>}
    </Paper>
  );
}

function Profile({ account, demo, onLock, onSignOut }: { account: Account; demo: boolean; onLock: () => void; onSignOut: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await onSignOut();
    } catch (problem) {
      setError(errorMessage(problem, "Connect to the internet to sign out."));
      setBusy(false);
    }
  }
  return (
    <Paper variant="outlined" className="panel profile-panel" component="section">
      <div className="profile-title"><Avatar>{account.username.slice(0, 2).toUpperCase()}</Avatar><div>
        <Typography component="h2" variant="h2">Your account</Typography>
        <Typography color="text.secondary">{account.username}</Typography>
      </div></div>
      <dl><dt>Device time zone</dt><dd>{timezone}</dd></dl>
      {demo && <Alert severity="info" variant="outlined">This local demo uses sample data and resets when the server stops.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <div className="profile-actions">
        <Button variant="outlined" startIcon={<Icon name="lock" small />} onClick={onLock} disabled={busy}>Lock journal</Button>
        <Button color="inherit" onClick={() => void signOut()} disabled={busy}>Sign out</Button>
      </div>
    </Paper>
  );
}

export function Workspace({ api, account, vaultKey, demo, onLock, onSignOut }: {
  api: MemoApi;
  account: Account;
  vaultKey: CryptoKey;
  demo: boolean;
  onLock: () => void;
  onSignOut: () => Promise<void>;
}) {
  const journal = useJournal(api, account, vaultKey);
  const [view, setView] = useState<View>("today");
  const [day, setDay] = useState(localDate);
  const [month, setMonth] = useState(() => fromDate(localDate()));
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<{ action: () => void } | null>(null);
  const openRequest = useRef(0);
  const today = localDate();

  useEffect(() => {
    if (!editor?.dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editor?.dirty, saving]);

  function navigate(action: () => void) {
    if (saving) return;
    if (editor?.dirty) setPendingNavigation({ action });
    else action();
  }

  function closeEditor() {
    openRequest.current++;
    setEditor(null);
    setLocalError("");
  }

  function showView(next: View, date = next === "today" ? today : day) {
    closeEditor();
    setView(next);
    setDay(date);
    if (next !== "journal") setQuery("");
    if (next === "today" || next === "calendar") setMonth(fromDate(date));
  }

  function selectDate(date: string) {
    navigate(() => showView(date === today ? "today" : "calendar", date));
  }

  function newEntry() {
    navigate(() => {
      closeEditor();
      setEditor({
        id: crypto.randomUUID(), base: null,
        header: { title: "", date: view === "journal" ? today : day, time_zone: timezone },
        document: { version: 1, blocks: [{ type: "paragraph", text: "" }] },
        conflicts: [], pending: false, dirty: false,
      });
    });
  }

  async function openEntry(row: JournalRow) {
    const request = ++openRequest.current;
    setLocalError("");
    try {
      const opened = await journal.openEntry(row.id);
      if (openRequest.current === request) setEditor(opened);
    } catch (error) {
      if (openRequest.current === request) setLocalError(errorMessage(error, "This entry needs a connection to open."));
    }
  }

  async function openConflict(revision: Revision) {
    if (!editor) return;
    try {
      const opened = await journal.openRevision(editor.id, revision);
      setEditor(previous => previous === editor ? { ...editor, ...opened, resolves: revision.id, dirty: true } : previous);
    } catch {
      setLocalError("Could not open that version.");
    }
  }

  async function saveEntry() {
    if (!editor || saving) return;
    setSaving(true);
    setLocalError("");
    try {
      setEditor(await journal.save(editor));
    } catch (error) {
      setLocalError(errorMessage(error, "Could not save the draft. Check your browser storage."));
    } finally {
      setSaving(false);
    }
  }

  function updateQuery(value: string) {
    if (view !== "journal" || editor) {
      navigate(() => { showView("journal"); setQuery(value); });
    } else {
      setQuery(value);
    }
  }

  const search = query.trim().toLocaleLowerCase();
  const entries = journal.rows.filter(row => (
    view === "journal"
      ? (row.title || "Untitled entry").toLocaleLowerCase().includes(search)
      : row.date === day
  ));
  const ack = editor && journal.acknowledgements[editor.id];
  const currentRow = editor && journal.rows.find(row => row.id === editor.id);
  let status = "";
  if (editor?.dirty) status = editor.resolves ? "Save to confirm this version" : "Unsaved changes";
  else if (editor && ack && ack.revision_id === editor.base && ack.conflict) status = "Alternate version saved";
  else if (editor?.base) {
    const synced = !editor.pending || ack?.revision_id === editor.base || (!!currentRow && currentRow.revisionId === editor.base && !currentRow.pending);
    status = synced ? "Synced" : "Sync pending";
  }

  return (
    <div className="workspace" data-view={view}>
      <aside className="desktop-sidebar" aria-label="Workspace">
        <Brand />
        <nav aria-label="Journal navigation">
          {navigation.map(item => <Button key={item.value} startIcon={<Icon name={item.icon} small />}
            color={view === item.value ? "primary" : "inherit"} aria-current={view === item.value ? "page" : undefined}
            onClick={() => navigate(() => showView(item.value))}>{item.label}</Button>)}
        </nav>
        <Button className="sidebar-lock" color="inherit" startIcon={<Icon name="lock" small />} onClick={() => navigate(onLock)}>Lock journal</Button>
      </aside>
      <div className="workspace-body">
        <header className="app-bar">
          <div className="mobile-brand"><Brand /></div>
          <form className="quick-search" onSubmit={event => { event.preventDefault(); updateQuery(query); }}>
            <Icon name="search" small />
            <InputBase inputProps={{ "aria-label": "Search entry titles" }} placeholder="Search entries"
              value={query} type="search" onChange={event => updateQuery(event.target.value)} fullWidth />
          </form>
          <div className="app-bar-end">
            {demo && <Chip size="small" label="Local demo" variant="outlined" className="demo-label" />}
            <IconButton aria-label="Open profile" onClick={() => navigate(() => showView("profile"))}>
              <Avatar className="account-avatar">{account.username.slice(0, 2).toUpperCase()}</Avatar>
            </IconButton>
          </div>
        </header>

        <main className="workspace-content">
          <header className="section-heading">
            <div>
              {(view === "today" || view === "calendar") && <div className="section-date"><Icon name="calendar" small /><time dateTime={day}>{fullDate.format(fromDate(day))}</time></div>}
              <Typography component="h1" variant="h1">{sectionTitle[view]}</Typography>
            </div>
            {view !== "profile" && <Button className="new-entry" variant="contained" size="large"
              startIcon={<Icon name="add" small />} onClick={newEntry} disabled={saving}>New entry</Button>}
          </header>

          {(journal.pending > 0 || journal.notice) && <Alert className="sync-alert" role="status" severity={journal.notice ? "warning" : "info"}
            icon={<Icon name="sync" small />} action={<Button color="inherit" size="small" onClick={() => void journal.synchronize()} disabled={journal.syncing}>Retry sync</Button>}>
            {journal.pending > 0 && <strong>Sync pending · {journal.pending} {journal.pending === 1 ? "change" : "changes"}</strong>}
            {journal.notice && <span>{journal.notice}</span>}
          </Alert>}
          {localError && !editor && <Alert severity="error" className="sync-alert">{localError}</Alert>}

          <div className="dashboard" data-editor={!!editor}>
            <div className="journal-column">
              {view === "profile" ? <Profile account={account} demo={demo} onLock={onLock} onSignOut={onSignOut} />
                : editor ? <EntryEditor key={editor.id} entry={editor} status={status} error={localError}
                  saving={saving} onChange={setEditor} onBack={() => navigate(closeEditor)}
                  onSave={() => void saveEntry()} onOpenConflict={revision => navigate(() => void openConflict(revision))} />
                  : <JournalList entries={entries} loading={journal.syncing && !journal.rows.length}
                    query={view === "journal" ? search : ""} singleDay={view !== "journal"}
                    title={view === "journal" ? "Journal entries" : "Entries for this day"} onOpen={row => void openEntry(row)} />}
            </div>
            {view !== "profile" && <Calendar month={month} selected={view === "journal" ? null : day}
              rows={journal.rows} onSelect={selectDate}
              onMonth={offset => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))} />}
          </div>
        </main>
      </div>
      <Paper component="nav" aria-label="Mobile journal navigation" className="mobile-navigation" square>
        <BottomNavigation value={view} onChange={(_, next: View) => navigate(() => showView(next))} showLabels>
          {navigation.map(item => <BottomNavigationAction key={item.value} value={item.value} label={item.label}
            icon={<Icon name={item.icon} small />} aria-current={view === item.value ? "page" : undefined} />)}
        </BottomNavigation>
      </Paper>
      <Dialog open={!!pendingNavigation} onClose={() => setPendingNavigation(null)}>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent><DialogContentText>Changes since your last save will be lost.</DialogContentText></DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingNavigation(null)} autoFocus>Keep editing</Button>
          <Button color="error" onClick={() => { const next = pendingNavigation; setPendingNavigation(null); next?.action(); }}>Discard changes</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
