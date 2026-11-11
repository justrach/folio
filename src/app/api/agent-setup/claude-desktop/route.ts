import { buildClaudeDesktopExtension, CLAUDE_DESKTOP_EXTENSION_FILENAME } from "@/lib/claude-desktop-extension";

export const dynamic = "force-dynamic";

/**
 * Folio's Claude Desktop extension, pointed at the site that served it. It holds no key or account data
 * (Claude asks for the key when it is installed), so it needs no sign-in.
 */
export async function GET(request: Request) {
  const bundle = await buildClaudeDesktopExtension(new URL(request.url).origin);
  return new Response(bundle, { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${CLAUDE_DESKTOP_EXTENSION_FILENAME}"`,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
}
