# Team workspace preview

Mode: Operate. `/orgs` refines the existing sample organization into a local interactive team workflow. The cream/green palette, soft workspace chrome, shared dropdown and press feedback remain in place.

The manager sees all three sample tasks, can assign a teammate, and reviews submitted proposals. The teammate perspective filters to the selected person's assigned tasks, allows draft proposals to be edited, and sends them for review. Approval changes only local preview state. An empty proposal cannot be submitted. Reset restores the original examples; leaving the page discards edits. The sample activity list records these local transitions.

The six sample people and confirmed credit values come from the existing November manager-ledger fixture. The usage link opens `/overview?view=demo&demo=team`, where reservations, confirmed credits and unknown usage remain distinct. The table scrolls within the content on small screens. Sample roles are a view switch, not authentication or enforced authorization.

The team concept has no invitations, shared backend records, team permissions, publishing, wallet or provider requests. Its header omits real audit/export controls and its floating real-run notebook is hidden to avoid mixing the preview with an owner's saved evidence. Actual account and run access remain unchanged elsewhere.

Validation: `tests/team-workspace.spec.ts` exercises assignment, empty personal work, edited proposal submission, manager approval, reset, the usage handoff and the absence of API writes on desktop/mobile. Separate read-only local screenshot checks cover light/dark layouts at 320, 393, 900 and 1440px. No production deployment or live team access is claimed.
