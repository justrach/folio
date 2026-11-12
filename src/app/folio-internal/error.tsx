"use client";

import { AdminRouteError } from "@/components/admin-route-error";

// Covers /folio-internal and /folio-internal/analytics.
export default function InternalError({ retry, reset }: { error: unknown; retry?: () => void; reset: () => void }) {
  return <AdminRouteError retry={retry} reset={reset} />;
}
