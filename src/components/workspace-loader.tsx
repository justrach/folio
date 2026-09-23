import type { CSSProperties } from "react";
import "./workspace-loader.css";

/** A read-only waiting state while route and account context resolve. */
export function WorkspaceLoader() {
  return (
    <main className="workspace-loading" role="status" aria-label="Loading your workspace" aria-live="polite">
      <div className="workspace-loader-content">
        <div className="workspace-loader-mark" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <i
              key={index}
              style={{ "--matrix-delay": `${(index % 4) * 110 + Math.floor(index / 4) * 70}ms` } as CSSProperties}
            />
          ))}
        </div>
        <p className="workspace-loader-title">Loading your workspace…</p>
        <p className="workspace-loader-description">Getting your websites and saved results ready.</p>
      </div>
    </main>
  );
}
