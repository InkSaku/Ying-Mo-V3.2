import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MediaLightboxProvider } from "./contexts/MediaLightboxContext";
import "@fontsource-variable/noto-serif-sc/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles/index.css";

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
