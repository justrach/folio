import "server-only";

/**
 * Beta: a person's standing on X, read from the public profile endpoint.
 *
 * Requires `X_BEARER_TOKEN`. Without it the feature reports `configured: false`
 * instead of guessing numbers, which is also what the UI shows. Nothing is stored:
 * the lookup is per request and the handle is validated before it leaves the app.
 */
export type XStanding = {
  configured: boolean;
  handle?: string;
  profile?: {
    id: string;
    name: string;
    username: string;
    description: string;
    followers: number;
    following: number;
    tweets: number;
    verified: boolean;
    createdAt: string | null;
    image: string | null;
    url: string;
  };
  error?: string;
};

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function normalizeHandle(value: string): string | null {
  const handle = value.trim().replace(/^@/, "");
  return HANDLE.test(handle) ? handle : null;
}

export async function fetchXStanding(handle: string, env: Record<string, unknown> = {}): Promise<XStanding> {
  const token = String(env.X_BEARER_TOKEN ?? process.env.X_BEARER_TOKEN ?? "").trim();
  if (!token) return { configured: false };
  const normalized = normalizeHandle(handle);
  if (!normalized) return { configured: true, error: "Enter a valid X handle (letters, numbers, underscore; up to 15)." };

  try {
    const response = await fetch(
      `https://api.x.com/2/users/by/username/${normalized}?user.fields=description,public_metrics,verified,created_at,profile_image_url`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" },
    );
    if (response.status === 401 || response.status === 403)
      return { configured: true, error: "The X bearer token was rejected. Check X_BEARER_TOKEN." };
    if (response.status === 429) return { configured: true, error: "X is rate limiting this token. Try again shortly." };
    if (!response.ok) return { configured: true, error: `X returned ${response.status}.` };
    const body = await response.json() as {
      data?: {
        id: string; name: string; username: string; description?: string; verified?: boolean;
        created_at?: string; profile_image_url?: string;
        public_metrics?: { followers_count: number; following_count: number; tweet_count: number };
      };
    };
    if (!body.data) return { configured: true, error: `No public profile for @${normalized}.` };
    const data = body.data;
    return {
      configured: true,
      handle: normalized,
      profile: {
        id: data.id,
        name: data.name,
        username: data.username,
        description: data.description ?? "",
        followers: data.public_metrics?.followers_count ?? 0,
        following: data.public_metrics?.following_count ?? 0,
        tweets: data.public_metrics?.tweet_count ?? 0,
        verified: Boolean(data.verified),
        createdAt: data.created_at ?? null,
        image: data.profile_image_url ?? null,
        url: `https://x.com/${data.username}`,
      },
    };
  } catch (error) {
    return { configured: true, error: error instanceof Error && error.name === "TimeoutError" ? "X did not answer in time." : "X could not be reached." };
  }
}
