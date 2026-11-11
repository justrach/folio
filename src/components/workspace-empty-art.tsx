import { HorizonSketch } from "./workspace-sketches";

/** Decorative only: never represents measured progress or evidence. Drawn by the pen (workspace-sketches.tsx), one drawing for both themes. */
export function WorkspaceEmptyArt() {
  return <HorizonSketch />;
}
