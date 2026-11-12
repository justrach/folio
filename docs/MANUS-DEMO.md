# Presenting Folio to the Manus team

A ten-minute walkthrough on `https://usefolio.site`: where manus.im shows up, what it is missing, and how each person at Manus joins the organization and connects their own agent. Everything shown is saved data; nothing in this script spends credits.

## Checked on 12 November 2026

Run against production (`https://usefolio.site/api/mcp`) over plain MCP with a *Read & record changes* key, not through any one agent:
- The server (`folio` 1.10.0 at the time of the check; 1.10.1 since the release later that day) lists 22 tools and the prompts `improve_aeo` and `review_aeo_changes`. `folio_capabilities` says "This connection can read and record changes. It can’t start paid work."
- `folio_organizations` returns Manus (2 members) sharing `manus.im`. `folio_find` with "manus" returns the organization, the website and two saved search & backlinks reports.
- `folio_website_gaps` for `manus.im` returns the report in section 1, with third-party sources named by kind, not by vendor.
- OAuth sign-in is live: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` answer, and a call without a key gets a `WWW-Authenticate` header pointing at them.

Three things did not hold up: page search for prompt 3, AI answers for prompt 2, and the Manus connector, which nobody has run. Each has an item below.

## Before the meeting

1. Sign in, open **Organizations** (`/orgs`) and select **Manus**. It shares `manus.im`.
2. Under **Invite people**, either:
   - **Add by email** each person, even before they have a Folio account. They join the first time they sign in with that email through Google or GitHub; until then they're listed as waiting to sign in (for 30 days), and you can cancel them. Folio sends no email: next to each waiting person, **Email the invite** opens your own mail app with a short note (which address to sign in with, and the link `https://usefolio.site/login?next=/orgs`), and **Copy message** copies the same note for chat.
   - Or press **Create invite link** and copy it. The link is shown once, works for 14 days and up to 25 people. Revoke it there after the meeting if you like.
3. **Use a fresh key.** Approve a new one for the meeting (*Read only* is enough unless you show recording changes; 7 days), and revoke any key that has been pasted into a chat or an agent transcript ([manage or revoke keys](/docs/api#api-keys)). Reads made beforehand, including the checks above, show under **What the team’s agents read**; say so if someone asks.
4. **Smoke check (60 seconds).** In the terminal you'll demo from, set the key without it landing in your shell history (paste it at the silent prompt, press Enter), then list the tools:

   ```sh
   read -rs FOLIO_API_KEY && export FOLIO_API_KEY
   curl -s https://usefolio.site/api/mcp \
     -H "Authorization: Bearer $FOLIO_API_KEY" \
     -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"folio_[a-z_]*"' | sort -u | wc -l
   ```

   Good: 22 for *Read & record changes*, 20 for *Read only*. 0 means the reply was an error: run it without the last three pipes and read it (401 is a bad key).
5. **Prompt 3 ("Do its pages answer the big searches?").** Checked on 12 November 2026: page search within manus.im returns one page, `https://www.manus.im/features/automations`, for every search tried. The pages Google ranks for the big searches (`/tools/ai-image-generator`, `/tools/ai-rap-generator`, `/playbook/video-generator`) aren't searchable, and the panel may not mark the prompt as empty, because Folio has read some manus.im pages. Skip it, or run it and present the answer as what it is: Folio hasn't read those pages yet. Adding pages happens in the index pipeline, outside this repository.
6. **Prompt 2 ("Who do AI answers recommend instead?").** None of the 100 questions about Manus has an answer, so it comes back "unmeasured", not a list of rivals; the panel may mark it as likely empty and list it last. Say so and present measuring as the next step (section 4). Fallback talking point: `folio_index_website` returns an HTML readiness score for the manus.im homepage (85 on 12 November 2026). Give its scope with it: "A bounded HTML rubric for one page; not search rank or AI visibility."
7. **The Manus connector is untested.** Try section 3's Manus steps in a Manus account if you can. Two failures to expect: 403 `Untrusted MCP origin` if Manus sends an `Origin` header (Folio refuses every origin but its own; on 12 November 2026 manus.im, app.manus.im and manus.ai origins were all refused, and accepting one is a code change, not a setting), and 406 if it doesn't send `Accept: application/json, text/event-stream`. Fallback: demo with Claude Code or Codex. Don't say those were tested today: the key path was checked over plain MCP, not through each client.

## 1. Where manus.im shows up (3 minutes)

Open **Websites**, pick `manus.im`, and walk down **Where it shows up**:

- **The sentence at the top.** "Google sends manus.im most of its search visits through searches for its own name, and it’s on page 2 or 3 for big searches like “ai image generator” (#20)." That search has 823K searches a month.
- **Google search.** The searches Folio tracks, each with its position, monthly volume and the page Google picks. Green is page one, amber is page two.
- **AI answers.** Folio's index already has 100 questions that name Manus next to ChatGPT, Claude, Gemini, Perplexity and Copilot (AI tools › AI assistants). None has been answered yet, so its place in AI answers is unmeasured, and the panel says so rather than reporting zero.
- **What it’s missing.** Each gap has a finding, a next step and links to the evidence: big searches just off page one, most visits coming from its own name, 1,099 links pointing at broken pages. That last one has no evidence links: the saved report has the count, not the list of URLs.
- **Not checked yet.** Unknowns stay separate from findings.
- **Where these numbers come from.** The line under the title reads "Folio combines third-party data providers with its own index of AI answers and crawled pages." Each number is labelled Google’s own count, Estimate, Third-party record or Recorded by Folio, with its provider (**Search data provider**, **Link data provider**, Google Search Console or Folio) and date.
  - For `manus.im` Search Console isn't imported, so the search visits show only the **Third-party estimate** (Search data provider, US), with a link to import Search Console.
  - If Manus imports its Search Console property, Google's own clicks appear beside the estimate with how far apart they are. For `codegraff.com` they are about 1,000 times apart.

The **Search and backlinks** panel below has the raw counts. In the report of 12 November 2026: 1.48M backlinks from 14,696 websites. These figures move with each saved report, so read them off the screen.

**If they ask why Folio's data is better than Ahrefs or Similarweb**, answer honestly (details in [Data sources](DATA-SOURCES.md)):
- Folio's search and backlink numbers come from third-party data providers and are estimated the same way as Ahrefs's. We don't claim they're more accurate.
- What Folio adds is Google's own count beside the estimate, a label on every number saying where it came from, and AI answers you can open and read.
- Ahrefs's own study puts the typical gap between its estimates and Search Console at about 50%.
- Ahrefs has far bigger indexes, and Similarweb covers traffic beyond search.

## 2. Join the organization (2 minutes)

People you added by email just sign in with Google at the link you sent; the sign-in page tells them to use the address they were added with. They land in the organization on a **Welcome** card that says who added them and points to two first steps: read the shared report, and connect their agent. With an invite link instead, each person opens it, signs in with Google, and presses **Join organization**; opening the link adds nobody by itself. Either way, they then see:

- the shared `manus.im` report (the saved data of whoever shared it),
- the members, and the agents each member has connected (key names and last use, never the key),
- **What the team’s agents read**: each agent read of a shared website, attributed to the person and their agent.

## 3. Connect your own agent (3 minutes)

The **Connect your agent** panel on the organization page walks each person through five steps. On `/agents`, someone who already has a connected agent sees **Your connected agents** first, then **Ask it something**, with the five steps folded under **Connect another agent**.

1. **Pick your agent**: Claude Code, Codex, Harness, Cursor, VS Code (Copilot agent mode), Claude Desktop, Manus, or any MCP client.
2. **Approve access for Claude Code** on a consent card: "Connect Claude Code to Folio", who's signed in, *Read only* or *Read & record changes* (**Paid actions** are folded away and each says it can charge), which organizations' shared websites it may read (*All*, or *Select* Manus only), the key's name ("Rach’s Claude Code") and expiry (7, 30 or 90 days). **Approve** creates the key; "The key is shown only now; copy it before you leave this page." On screen the key is masked until someone presses **Show**. **Copy command** copies `export FOLIO_API_KEY="…"` (clients that don't read the shell get **Copy key**), with a note to paste it into a terminal, never into a chat with an agent. On a shared screen, don't press **Show**.
   The step to do next is ringed, and the steps after it wait in grey until it's done.
3. **Add Folio to it, in one step.** Cursor gets **Add to Cursor** (the key goes straight into Cursor), VS Code **Add to VS Code** (VS Code asks for the key), Claude Desktop **Download for Claude Desktop** (open the file; Claude asks for the key), and Claude Code and Codex **Copy command**: one command with the key in it, masked on screen (Codex's also saves the key in your shell profile). Harness signs in by itself, so it skips the key: its command (`graff mcp add folio --url https://usefolio.site/api/mcp --everywhere && graff mcp login folio`) opens Folio's consent card in the browser, and no key appears in the command or in Harness's transcript. By hand, Claude Code is:

   ```sh
   claude mcp add --transport http --scope user folio https://usefolio.site/api/mcp \
     --header "Authorization: Bearer $FOLIO_API_KEY"
   ```

   There's also a `.mcp.json` the team can commit to its repository (it holds no key; each person sets their own `FOLIO_API_KEY`), and the matching setup for each other client. For clients that can't read `FOLIO_API_KEY` (Claude Desktop, VS Code, Manus, any MCP client), the screen keeps a `<your Folio key>` placeholder; once the key exists, **Copy file** and **Copy value** put it into what they copy, with a note on where it's safe to paste. claude.ai and ChatGPT custom connectors need only the public URL: they open Folio and you approve them on the same card, with no key.

   **For Manus itself**, pick **Manus**: in Manus, open **Connectors**, choose **Create** and add a custom MCP server by URL. The panel lays out Manus's three fields, **Server name** (`folio`), **Server URL** (`https://usefolio.site/api/mcp`) and **Bearer token**, each with **Copy value**; after step 2 the token row shows the masked key and **Copy key**. Manus tests the connection when it's saved. Then turn the folio connector on in a task; step 4's **Copy prompt** asks it to list the folio tools and call `folio_organizations` and `folio_targets`. The panel says to start with *Read only* and a short expiry, and that these steps follow Manus's documentation and haven't been run in a Manus account. See item 7 above.
4. **Check it’s connected**: `claude mcp list` should show `folio: … ✔ Connected`, and **Or test the key from any terminal** makes one free `folio_organizations` call using `FOLIO_API_KEY`. The status box turns to **Connected** by itself the moment the new key makes its first call. Each connection shows its name, when it was last used, "Signed in" or "Key", what it can do ("Read & record changes · 22 tools") and a money line ("Can’t start paid work"). The agent also appears under **Members and their agents**.
5. **Ask it something.** Four ready prompts, each with **Copy prompt**: "What is manus.im missing?", "Who do AI answers recommend instead?", "Do its pages answer the big searches?" and "Fix the top gap in this repository". Prompts the saved report says will come back empty are marked and listed last. For a shared website such as `manus.im`, the fix prompt is read-only: the agent proposes edits in the repository and hands back a title, summary and files for the owner to record. The guided `/mcp__folio__improve_aeo` slash command is offered only for your own websites, in Claude Code. Typed or picked by hand, the guided prompt also works for `manus.im` (from server 1.10.1): it finds the website with `folio_organizations`, says up front that only the owner can record changes for it, says no question has a completed AI answer yet, and carries on with the gaps report instead of stopping.

   In an agent that shows MCP Apps (Claude Desktop, VS Code with Copilot), asking "find manus in Folio" shows Folio itself in the chat:
   - a search box with the Manus organization, `manus.im` and its saved reports;
   - **What it’s missing** opens the same report as the website page;
   - **Ask my agent to fix this** hands a gap back to the agent.

   This has been tested against the official MCP Apps host bridge, not yet in Claude Desktop or VS Code, so try it before the meeting.

The first prompt calls `folio_organizations`, finds `manus.im`'s `websiteId`, then `folio_website_gaps`, which returns the same report as the page, as structured data. Refresh the organization page: the read appears under **What the team’s agents read**.

Below the steps, **What your agent can do with each permission** lists every tool by permission (and which ones can charge), and **If it doesn’t connect** covers the usual causes: a mistyped, expired or revoked key, missing tools, a variable the editor can't see, 403 `Untrusted MCP origin` for browser-based clients, the 60-requests-a-minute limit, claude.ai and ChatGPT connectors (add the public URL with no key and approve on Folio), and a failed Manus connection test.

## 4. What happens next (2 minutes)

- **Measure AI answers.** Running the 100 AI-assistant questions shows where Manus is named against ChatGPT, Claude, Gemini, Perplexity and Copilot. Each answer is a paid run that someone starts deliberately.
- **Close the loop.** With the `changes` permission, an agent records an edit it made (`folio_change_record`); after it is live, a retest shows the answer before and after. See [AEO walkthrough](AEO-DEMO.md).
- **Credits per person** are not built yet: today paid work runs on the account that starts it.

## What is real and what is not

Real: organizations, invite links and adding by email, membership, roles, shared websites, each member's own keys and agents, the reports and the agent tools. OAuth sign-in (live, checked on 12 November 2026; not run from claude.ai or ChatGPT in that check). Saved data only.

Untested: connecting Manus itself (documented steps, not yet run in a Manus account), and MCP Apps in Claude Desktop or VS Code.

Not yet: per-member credit budgets, shared question sets (questions still belong to the person who saved them), and any measurement of Manus in AI answers until those questions are run. Page search covers one manus.im page. The list of broken links isn't collected, only their count.
