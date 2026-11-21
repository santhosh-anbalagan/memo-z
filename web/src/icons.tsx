import { SvgIcon } from "@mui/material";

const paths = {
  brand: "M6 4.5h11a2 2 0 0 1 2 2v13H7a2.5 2.5 0 0 1-2.5-2.5v-11A1.5 1.5 0 0 1 6 4.5ZM7 15.5h12M8.5 8.5h6.5M8.5 11.5H13",
  today: "M12 3v2m0 14v2M3 12h2m14 0h2M5.65 5.65l1.4 1.4m9.9 9.9 1.4 1.4m0-12.7-1.4 1.4m-9.9 9.9-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  entries: "M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h4",
  calendar: "M5 6h14a1 1 0 0 1 1 1v12H4V7a1 1 0 0 1 1-1Zm3-2v4m8-4v4M4 10h16m-11 4h.1m2.9 0h.1m2.9 0h.1",
  profile: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1",
  lock: "M8 10V7a4 4 0 0 1 8 0v3M6 10h12v10H6zM12 14v2",
  add: "M12 5v14M5 12h14",
  search: "M16 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Zm-1.7 4L20 20",
  left: "m15 6-6 6 6 6",
  right: "m9 6 6 6-6 6",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  trash: "M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5",
  sync: "M20 7v5h-5M4 17v-5h5m-4.5-4a8 8 0 0 1 13.5-2L20 12M4 12l2 6a8 8 0 0 0 13.5-2",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
} as const;

export function Icon({ name, small = false }: { name: keyof typeof paths; small?: boolean }) {
  return (
    <SvgIcon fontSize={small ? "small" : "medium"} aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </SvgIcon>
  );
}

export function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="brand" small /></span><span>Memo Z</span></div>;
}
