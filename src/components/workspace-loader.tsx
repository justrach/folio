import { InkLoader } from "./workspace-sketches";
import "./workspace-loader.css";

/** A read-only waiting state while route and account context resolve. The drawing is decoration;
 *  the two lines of text say what is happening. */
export function WorkspaceLoader() {
  return (
    <main className="workspace-loading" role="status" aria-label="Loading your workspace" aria-live="polite">
      <div className="workspace-loader-content">
        <div className="workspace-loader-mark" aria-hidden="true">
          <InkLoader />
        </div>
        <p className="workspace-loader-title">Loading your workspace…</p>
        <p className="workspace-loader-description">Getting your websites and saved results ready.</p>
      </div>
    </main>
  );
}
