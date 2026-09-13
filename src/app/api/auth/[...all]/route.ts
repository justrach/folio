import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  try {
    return await (await getAuth()).handler(request);
  } catch (error) {
    // Detailed diagnostics stay on the server; configuration never leaks to clients.
    console.error(
      "Authentication request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        code: "AUTH_UNAVAILABLE",
        message: "Sign-in is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}

export const GET = handler;
export const POST = handler;
