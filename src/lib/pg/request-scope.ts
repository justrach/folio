import { AsyncLocalStorage } from "node:async_hooks";

type Resource = { end(): Promise<void> };
const requests = new AsyncLocalStorage<Map<string, Resource>>();

/** Share connections only within this invocation, never between Worker requests. */
export function requestResource<T extends Resource>(key: string, create: () => T): T {
  const current = requests.getStore();
  if (!current) return create();
  const existing = current.get(key);
  if (existing) return existing as T;
  const resource = create();
  current.set(key, resource);
  return resource;
}

export async function withDatabaseRequest<T>(work: () => Promise<T>): Promise<T> {
  return requests.run(new Map(), async () => {
    try { return await work(); }
    finally {
      // A failed request is never retried here, particularly after a write.
      await Promise.allSettled([...requests.getStore()!.values()].map(resource => resource.end()));
    }
  });
}
