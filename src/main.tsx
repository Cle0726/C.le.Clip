import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installMotionEffects } from "./motion";
import "./styles.css";
import "./motion.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

requestAnimationFrame(() => installMotionEffects());
