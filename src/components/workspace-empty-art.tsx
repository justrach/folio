import Image from "next/image";

/** Decorative only: never represents measured progress or evidence. */
export function WorkspaceEmptyArt() {
  return <Image className="workspace-empty-art" src="/images/folio-workspace-horizon.webp" alt="" width={900} height={300} sizes="(max-width: 760px) 240px, 320px" />;
}
