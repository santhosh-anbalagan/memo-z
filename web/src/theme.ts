import { createTheme } from "@mui/material/styles";

export const colors = {
  canvas: "#F6F7FB",
  surface: "#FFFFFF",
  ink: "#17192B",
  muted: "#56617A",
  line: "#E4E8F1",
  accent: "#4B43DA",
  accentDark: "#3A32B7",
  accentSoft: "#EFEEFF",
};

export const theme = createTheme({
  palette: {
    primary: { main: colors.accent, dark: colors.accentDark, light: colors.accentSoft },
    background: { default: colors.canvas, paper: colors.surface },
    text: { primary: colors.ink, secondary: colors.muted },
    divider: colors.line,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    h1: { fontSize: "clamp(2rem, 5vw, 2.75rem)", lineHeight: 1.1, fontWeight: 720, letterSpacing: "-.055em" },
    h2: { fontSize: "1.15rem", lineHeight: 1.3, fontWeight: 700, letterSpacing: "-.02em" },
    h3: { fontSize: "1rem", lineHeight: 1.4, fontWeight: 680 },
    button: { fontWeight: 650, letterSpacing: "0", textTransform: "none" },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40, borderRadius: 10 }, contained: { color: "#fff" } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: { borderColor: colors.line } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 650 } } },
  },
});
