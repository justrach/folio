"use client";

import "../app/admin/admin.css";

/**
 * Shown when an internal admin page throws while rendering, most often because the session or a database read on a
 * fresh connection failed. It never shows the error text or digest. `notFound()` and `redirect()` are not caught here:
 * Next's error boundary rethrows them, so signed-out and non-admin visitors still get the 404.
 */
export function AdminRouteError({ retry, reset }: { retry?: () => void; reset: () => void }) {
  return (
    <main className="admin">
      <header>
        <span className="admin-kicker">Internal</span>
        <h1>This page couldn’t load</h1>
      </header>
      <p className="admin-alert" role="alert">Folio couldn’t confirm your sign-in or read this page just now. Try again in a moment.</p>
      {/* retry re-requests the page from the server and then clears the boundary (reset); reset alone would only re-render the failed result. */}
      <button type="button" className="button secondary" onClick={() => (retry ?? reset)()}>Try again</button>
    </main>
  );
}
