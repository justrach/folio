# Presenting Folio to the Manus team

A ten-minute walkthrough on `https://usefolio.site`: where manus.im shows up, what it is missing, and how each person at Manus joins the organization and connects their own agent. Everything shown is saved data; nothing in this script spends credits.

## Before the meeting

1. Sign in, open **Organizations** (`/orgs`) and select **Manus**. It shares `manus.im`.
2. Under **Invite people**, either:
   - **Add by email** each person, even before they have a Folio account. They join the first time they sign in with that email through Google or GitHub; until then they're listed as waiting to sign in (for 30 days), and you can cancel them. Folio sends no email: send them the sign-in link shown there (`https://usefolio.site/login?next=/orgs`).
   - Or press **Create invite link** and copy it. The link is shown once, works for 14 days and up to 25 people. Revoke it there after the meeting if you like.
3. Have a terminal with Claude Code (or Codex) ready, and a Folio key in `FOLIO_API_KEY` ([create one](/docs/api#api-keys); read access is enough).

## 1. Where manus.im shows up (3 minutes)

Open **Websites**, pick `manus.im`, and walk down **Where it shows up**:

- **The sentence at the top.** Google sends manus.im most of its search visits through searches for "manus", and it sits on page 2 or 3 for big searches such as "ai image generator" (823K searches a month, #20).
- **Google search.** The searches Folio tracks, each with its position, monthly volume and the page Google picks. Green is page one, amber is page two.
- **AI answers.** Folio's index already has 100 questions that name Manus next to ChatGPT, Claude, Gemini, Perplexity and Copilot (AI tools › AI assistants). None has been answered yet, so its place in AI answers is unmeasured, and the panel says so rather than reporting zero.
- **What it's missing.** Each gap has a finding, a next step and links to the evidence: big searches just off page one, most visits coming from its own name, 1,099 links pointing at broken pages.
- **Not checked yet.** Unknowns stay separate from findings.

The **Search and backlinks** panel below has the raw counts: 1.47M backlinks from 14,634 websites.

## 2. Join the organization (2 minutes)

People you added by email just sign in with Google at the link you sent: they land in the organization, with a note saying who added them. With an invite link instead, each person opens it, signs in with Google, and presses **Join organization**; opening the link adds nobody by itself. Either way, they then see:

- the shared `manus.im` report (the saved data of whoever shared it),
- the members, and the agents each member has connected (key names and last use, never the key),
- **What the team's agents read**: each agent read of a shared website, attributed to the person and their agent.

## 3. Connect your own agent (3 minutes)

The **Connect your agent** panel on the organization page (also at `/agents#connect`) walks each person through five steps:

1. **Pick your agent**: Claude Code, Codex, Cursor, VS Code (Copilot agent mode), Claude Desktop, Manus, or any MCP client.
2. **Create a key for it** right there. It's named after the agent ("Rach's Claude Code"), has read access by default, and can optionally record changes or, deliberately, spend. The key is shown once and masked on screen; **Copy export line** copies `export FOLIO_API_KEY="…"`. Safe to do while screen-sharing.
3. **Add Folio to it.** For Claude Code that's one command:

   ```sh
   claude mcp add --transport http --scope user folio https://usefolio.site/api/mcp \
     --header "Authorization: Bearer $FOLIO_API_KEY"
   ```

   There's also a `.mcp.json` the team can commit to its repository (it holds no key; each person sets their own `FOLIO_API_KEY`), and the matching setup for each other client.

   **For Manus itself**, pick **Manus**: in Manus, open **Connectors → Create** and add a custom MCP server by URL, named `folio`, with URL `https://usefolio.site/api/mcp` and the key as a **Bearer token** (**Copy key** copies just the key). Manus tests the connection when it's saved. Then turn the folio connector on in a task and ask it to list the folio tools and call `folio_organizations`. These steps follow Manus's documentation and haven't been run in a Manus account yet, so try them before the meeting if you can; if Manus reports 403 `Untrusted MCP origin`, Folio needs to accept Manus's origin first.
4. **Check it's connected**: `claude mcp list` should show `folio: … ✔ Connected`. The status box on the page turns green by itself the moment the new key makes its first call, and the agent appears under **Members and their agents**.
5. **Ask it something.** Four ready prompts: what manus.im is missing, who AI answers recommend instead, whether its pages answer the big searches, and fixing the top gap in the website's repository (in Claude Code, `/mcp__folio__improve_aeo` runs the guided version).

The first prompt calls `folio_organizations`, finds `manus.im`'s `websiteId`, then `folio_website_gaps`, which returns the same report as the page, as structured data. Refresh the organization page: the read appears under **What the team's agents read**.

Below the steps, **What your agent can do with each permission** lists every tool by permission (and which ones can charge), and **If it doesn't connect** covers the usual causes: an expired key, a variable the editor can't see, browser clients, the 60-requests-a-minute limit, and web connectors (Claude.ai, ChatGPT) that need OAuth, which Folio doesn't offer yet.

## 4. What happens next (2 minutes)

- **Measure AI answers.** Running the 100 AI-assistant questions shows where Manus is named against ChatGPT, Claude, Gemini, Perplexity and Copilot. Each answer is a paid run that someone starts deliberately.
- **Close the loop.** With the `changes` permission, an agent records an edit it made (`folio_change_record`); after it is live, a retest shows the answer before and after. See [AEO walkthrough](AEO-DEMO.md).
- **Credits per person** are not built yet: today paid work runs on the account that starts it.

## What is real and what is not

Real: organizations, invite links and adding by email, membership, roles, shared websites, each member's own keys and agents, the reports and the agent tools. Saved data only.

Untested: connecting Manus itself (documented steps, not yet run in a Manus account).

Not yet: per-member credit budgets, shared question sets (questions still belong to the person who saved them), and any measurement of Manus in AI answers until those questions are run.
