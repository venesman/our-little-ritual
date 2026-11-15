import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/700.css";
import "@fontsource-variable/dm-sans";
import "./index.css";
import App from "./App";
import { initInstallCapture, registerServiceWorker } from "./lib/install";

initInstallCapture();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
