"use client";

import { AdminRouteError } from "@/components/admin-route-error";

export default function AdminError({ retry, reset }: { error: unknown; retry?: () => void; reset: () => void }) {
  return <AdminRouteError retry={retry} reset={reset} />;
}
