import { Button, IconButton, Paper, Typography } from "@mui/material";
import { Icon } from "./icons.js";
import { fromDate, localDate } from "./journal.js";
import type { JournalRow } from "./useJournal.js";

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
export const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const weekdayLabels = Array.from({ length: 7 }, (_, i) => weekdayFormatter.format(new Date(2025, 0, i + 6)));

export function Calendar({
  month, selected, rows, onMonth, onSelect,
}: {
  month: Date;
  selected: string | null;
  rows: JournalRow[];
  onMonth: (offset: number) => void;
  onSelect: (day: string) => void;
}) {
  const year = month.getFullYear();
  const index = month.getMonth();
  const first = (new Date(year, index, 1).getDay() + 6) % 7;
  const count = new Date(year, index + 1, 0).getDate();
  const dates = new Set(rows.map(row => row.date));
  const today = localDate();

  return (
    <Paper variant="outlined" className="panel calendar-panel" component="aside" aria-label="Journal calendar">
      <div className="calendar-header">
        <Typography component="h2" variant="h2">{monthFormatter.format(month)}</Typography>
        <div className="calendar-controls">
          <IconButton aria-label="Previous month" onClick={() => onMonth(-1)} disabled={year === 1900 && index === 0}><Icon name="left" small /></IconButton>
          <IconButton aria-label="Next month" onClick={() => onMonth(1)} disabled={year === 9999 && index === 11}><Icon name="right" small /></IconButton>
        </div>
      </div>
      <div className="date-grid">
        {weekdayLabels.map((label, i) => <span className="weekday" key={i}>{label}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = localDate(new Date(year, index, i + 1));
          return (
            <button className={`calendar-day${dates.has(date) ? " has-entry" : ""}`} type="button" key={date}
              aria-label={`${fullDate.format(fromDate(date))}${dates.has(date) ? ", has entries" : ""}`}
              aria-pressed={date === selected} aria-current={date === today ? "date" : undefined}
              onClick={() => onSelect(date)}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="calendar-footer">
        <span><i aria-hidden="true" /> Journal entry</span>
        <Button size="small" onClick={() => onSelect(today)}>Today</Button>
      </div>
    </Paper>
  );
}
