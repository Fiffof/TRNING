import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/* Error boundary: a runtime error shows a recovery screen instead of a blank page.
   Data is unaffected — it lives in localStorage, not in React state. */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#0E1116", color: "#E8EDF2", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 380, fontFamily: "ui-monospace, monospace" }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Something broke.</div>
            <div style={{ fontSize: 13, color: "#8A95A3", marginTop: 8, lineHeight: 1.5 }}>
              Your logged data is safe — it lives in this browser's storage, not in the crashed screen. Reload to recover.
            </div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "12px 20px", minHeight: 44, borderRadius: 12, border: "1px solid #34D5C955", background: "#34D5C91F", color: "#34D5C9", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Reload
            </button>
            <div style={{ fontSize: 11, color: "#7E8896", marginTop: 14, wordBreak: "break-word" }}>{String(this.state.error)}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
