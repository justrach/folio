# Singapore placement and authentication deployment drift — 8 November 2026

The production backend configuration now requests `aws:ap-southeast-1` placement.
The database remains in Sydney (`ap-southeast-2`); this is not a database move or
a data-residency guarantee. The frontend remains at the edge. Wrangler's backend
dry build passed for this configuration; application code is unchanged from the
previous verified main release.

Investigation found production backend version
`0fc21c82-df71-4650-9c64-5d06908471ce` had replaced the tested main backend.
The downloaded replacement artifact did not contain the shared request-context
coordinator or the live-public-data source marker. Identity secrets and database
bindings still matched. A twelve-read baseline had seven successful public reads
and five 503 responses; successful reads had a median of 541 ms. The user observed
long waits followed by AUTH_UNAVAILABLE during Google login. One bounded sign-in
probe still succeeded, consistent with an intermittent backend failure rather
than proof that Google client configuration was missing.

Redeploying the tested main backend with Singapore placement produced version
`6bfa994f-ea4e-4d7e-bb13-86fca5b71943`. Its version metadata confirmed targeted
placement at `aws:ap-southeast-1`; twelve public reads all returned live data, with
a median of 409 ms and a maximum of 684 ms. Responses reported `local-SIN`.
The comparison includes both restoration of the connection fix and placement;
it does not isolate the performance effect of geography alone.

Three Google sign-in initiations returned 200 with accounts.google.com, the
correct production callback and identity-only scopes. Their cancellation callbacks
returned to login successfully. The first start took 1,141 ms and two warm starts
150 and 142 ms. A fourth probe was correctly rate-limited (429); limits were not
weakened. No real Google account was selected and no authorization code/token
exchange was performed.

Before verification could finish, another deployment replaced that backend with
`270b8513-2464-4f99-a196-c9aa5e5150ac`. A subsequent callback check returned 500.
Main and the frontend had not changed. The current deployment therefore cannot
be claimed as a stable, completed Google-login fix. Deployment coordination is
required before the restored runtime can be verified and retained. The competing
deployer must use main's request-scoped backend entry point rather than restoring
an older pool implementation. A focused compatibility patch for the older source
was prepared privately and checked for applicability without modifying another
worktree's active files.

Provider secrets, OAuth request data, private tail output and deployment artifacts
remain outside Git. No paid agent work, database migration or credential change
was performed.


## Resumed after deployment coordination

After the user confirmed they would pause the competing publisher, the backend
was rebuilt from main `0689e44` and deployed as
`80cbf464-d547-425b-a05f-22633e912dff`. The production build passed. Cloudflare
version metadata confirmed targeted placement at `aws:ap-southeast-1`; the same
version remained active during verification. Existing identity secrets, D1 and
Hyperdrive binding metadata were preserved.

Twelve live public reads all succeeded without snapshot fallback, with a median
of 432.5 ms and maximum of 743 ms. All reported `local-SIN`. Two separately spaced
Google sign-in starts returned 200 in 700 ms and 1,692 ms with accounts.google.com
and the correct production callback. Both cancellation callbacks returned cleanly
to login. Ten account/report/integration-status endpoints returned their expected
anonymous responses. No real Google identity consent or successful authorization
code exchange was performed; the owner should retry the actual Google account
flow in their browser. No credential change, migration or paid provider run was
needed.

The paused publisher must incorporate current main and its request-scoped backend
entry point before deploying again; publishing the older backend would reintroduce
the regression. Earlier failures above remain recorded as historical evidence.
