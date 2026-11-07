import Image from "next/image";

/** Decorative only: never represents measured progress or evidence. */
export function WorkspaceEmptyArt() {
  return <><Image className="workspace-empty-art theme-art-light" src="/images/folio-workspace-horizon.webp" alt="" width={900} height={300} sizes="(max-width: 760px) 240px, 320px" /><Image className="workspace-empty-art theme-art-dark" src="/images/folio-workspace-horizon-dark.webp" alt="" width={900} height={300} sizes="(max-width: 760px) 240px, 320px" /></>;
}
