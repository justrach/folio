import type { HTMLAttributes, ReactNode } from "react";
import { WorkspaceEmptyArt } from "./workspace-empty-art";
import "./workspace-state.css";

/** One layout for empty, unavailable and signed-out workspace states: the horizon art, a plain statement, and the next step.
 *  The art is decorative. The title and copy carry the state, so an error never reads as an empty result. */
export function WorkspaceState({ title, children, actions, className, ...props }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title: string; actions?: ReactNode }) {
  return <section {...props} className={["workspace-state", className].filter(Boolean).join(" ")}>
    <WorkspaceEmptyArt />
    <div className="workspace-state-copy">
      <h2>{title}</h2>
      {children}
      {actions ? <div className="workspace-state-actions">{actions}</div> : null}
    </div>
  </section>;
}
