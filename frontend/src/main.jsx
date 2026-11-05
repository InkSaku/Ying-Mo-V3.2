import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MediaLightboxProvider } from "./contexts/MediaLightboxContext";
import { initializeChunkRecovery } from "./lib/chunkRecovery";
import { initializePwaInstall } from "./lib/pwaInstall";
import "./styles/index.css";
import "./styles/p1-editorial.css";
import "./styles/article-transitions.css";
import "./styles/ink-system.css";
import "./styles/ink-room.css";
import "./styles/mobile-platform.css";
import "./styles/mobile-layout.css";

// Font faces are 25% of the entry CSS; text already renders with fallbacks, so don't block on them.
void import("@fontsource-variable/noto-serif-sc/wght.css");
void import("@fontsource-variable/jetbrains-mono/wght.css");

initializeChunkRecovery();
initializePwaInstall();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MediaLightboxProvider>
            <App />
          </MediaLightboxProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
