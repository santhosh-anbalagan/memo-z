import { Alert, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import type { FormEvent } from "react";
import type { Revision } from "./api.js";
import { Icon } from "./icons.js";
import { blockTypes } from "./journal.js";
import type { JournalBlock } from "./journal.js";
import type { EditorEntry } from "./useJournal.js";

const labels = { paragraph: "Paragraph", heading: "Heading", bullet: "Bullet" };

export function EntryEditor({ entry, status, error, saving, onChange, onBack, onSave, onOpenConflict }: {
  entry: EditorEntry;
  status: string;
  error: string;
  saving: boolean;
  onChange: (entry: EditorEntry) => void;
  onBack: () => void;
  onSave: () => void;
  onOpenConflict: (revision: Revision) => void;
}) {
  const blocks = entry.document.blocks;
  function setBlocks(next: JournalBlock[]) {
    onChange({ ...entry, document: { ...entry.document, blocks: next }, dirty: true });
  }

  function move(index: number, offset: number) {
    const next = [...blocks];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setBlocks(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  function updateDate(date: string) {
    if (date !== entry.header.date) {
      onChange({ ...entry, header: { ...entry.header, date }, dirty: true });
    }
  }

  return (
    <Paper variant="outlined" className="panel editor-panel" component="section" aria-label="Entry editor">
      <form onSubmit={submit}>
        <div className="editor-top">
          <Button onClick={onBack} disabled={saving} color="inherit" startIcon={<Icon name="left" small />}>Back to entries</Button>
          {status && <Chip size="small" label={status} variant="outlined" role="status"
            icon={<Icon name={status === "Synced" ? "check" : "clock"} small />} />}
        </div>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Title" value={entry.header.title} className="entry-title"
          onChange={event => onChange({ ...entry, header: { ...entry.header, title: event.target.value }, dirty: true })}
          disabled={saving} fullWidth placeholder="Untitled entry"
          slotProps={{ htmlInput: { maxLength: 160 } }} autoFocus />
        <TextField type="date" label="Journal date" size="small" value={entry.header.date} className="entry-date-field"
          onChange={event => updateDate(event.target.value)} disabled={saving} required
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: {
              min: "1900-01-01", max: "9999-12-31",
              onInput: (event: FormEvent<HTMLInputElement>) => updateDate(event.currentTarget.value),
            },
          }} />
        <div className="editor-blocks">
          {blocks.map((block, index) => (
            <div className="editor-block" data-type={block.type} key={index}>
              <div className="block-actions">
                <label htmlFor={`journal-block-${index}`}>{labels[block.type]}</label>
                <div>
                  <IconButton aria-label={`Move block ${index + 1} up`} onClick={() => move(index, -1)} disabled={saving || index === 0}><Icon name="up" small /></IconButton>
                  <IconButton aria-label={`Move block ${index + 1} down`} onClick={() => move(index, 1)} disabled={saving || index === blocks.length - 1}><Icon name="down" small /></IconButton>
                  <IconButton aria-label={`Remove block ${index + 1}`} onClick={() => setBlocks(blocks.filter((_, i) => i !== index))} disabled={saving}><Icon name="trash" small /></IconButton>
                </div>
              </div>
              <textarea className="block-text" id={`journal-block-${index}`} value={block.text}
                placeholder={block.type === "paragraph" ? "What’s on your mind?" : undefined}
                rows={block.type === "heading" ? 2 : 3} disabled={saving}
                onChange={event => setBlocks(blocks.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} />
            </div>
          ))}
        </div>
        <Stack direction="row" spacing={0} useFlexGap flexWrap="wrap" className="block-toolbar">
          {blockTypes.map(type => (
            <Button key={type} size="small" variant="outlined" disabled={saving} startIcon={<Icon name="add" small />}
              onClick={() => setBlocks([...blocks, { type, text: "" }])}>{labels[type]}</Button>
          ))}
        </Stack>
        {!!entry.conflicts.length && <Alert variant="outlined" severity="warning">
          <Typography variant="body2">Another device saved a different version. Open it to review, or keep this draft.</Typography>
          {entry.conflicts.map(revision => <div key={revision.id} className="conflict-actions">
            <Button size="small" disabled={saving} onClick={() => onOpenConflict(revision)}>
              Open version from {new Date(revision.saved_at).toLocaleString()}
            </Button>
            <Button size="small" disabled={saving}
              onClick={() => onChange({ ...entry, resolves: revision.id, dirty: true })}>Keep the open version</Button>
          </div>)}
        </Alert>}
        <div className="editor-footer">
          <Button variant="contained" type="submit" disabled={saving}>{saving ? "Saving…" : "Save entry"}</Button>
        </div>
      </form>
    </Paper>
  );
}
