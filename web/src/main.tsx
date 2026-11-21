import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createRoot } from "react-dom/client";
import { Access } from "./Access.js";
import { theme } from "./theme.js";

const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
const styles = createCache({ key: "memo", nonce });
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <CacheProvider value={styles}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Access />
      </ThemeProvider>
    </CacheProvider>,
  );
}
