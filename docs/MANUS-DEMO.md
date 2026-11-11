# Presenting Folio to the Manus team

A ten-minute walkthrough on `https://usefolio.site`: where manus.im shows up, what it is missing, and how each person at Manus joins the organization and connects their own agent. Everything shown is saved data; nothing in this script spends credits.

## Before the meeting

1. Sign in, open **Organizations** (`/orgs`) and select **Manus**. It shares `manus.im`.
2. Under **Invite people**, press **Create invite link** and copy it. The link is shown once, works for 14 days and up to 25 people. Revoke it there after the meeting if you like.
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

Share the invite link. Each person opens it, signs in with Google, and presses **Join organization**. Opening the link adds nobody by itself. They then see:

- the shared `manus.im` report (the saved data of whoever shared it),
- the members, and the agents each member has connected (key names and last use, never the key),
- **What the team's agents read**: each agent read of a shared website, attributed to the person and their agent.

## 3. Connect your own agent (3 minutes)

The **Connect your agent** card on the organization page has the three steps, with copy buttons:

1. **Create a Folio key.** Each person uses their own; it sees their websites plus everything shared with the organization.
2. **Add Folio to the agent**: `.mcp.json` for Claude Code, `config.toml` for Codex, or any Streamable HTTP MCP client at `/api/mcp` with `Authorization: Bearer <key>`.
3. **Ask it.** The suggested prompt is:

   > Use Folio (the "folio" MCP server). Call folio_organizations to find the websites Manus shares, then folio_website_gaps for manus.im. Tell me what it's missing, which gap to fix first and why, and what hasn't been checked yet. Don't start anything paid.

The agent calls `folio_organizations`, finds `manus.im`'s `websiteId`, then `folio_website_gaps`, which returns the same report as the page, as structured data. Refresh the organization page: the read appears under **What the team's agents read**.

## 4. What happens next (2 minutes)

- **Measure AI answers.** Running the 100 AI-assistant questions shows where Manus is named against ChatGPT, Claude, Gemini, Perplexity and Copilot. Each answer is a paid run that someone starts deliberately.
- **Close the loop.** With the `changes` permission, an agent records an edit it made (`folio_change_record`); after it is live, a retest shows the answer before and after. See [AEO walkthrough](AEO-DEMO.md).
- **Credits per person** are not built yet: today paid work runs on the account that starts it.

## What is real and what is not

Real: organizations, invites, membership, roles, shared websites, each member's own keys and agents, the reports and the agent tools. Saved data only.

Not yet: per-member credit budgets, shared question sets (questions still belong to the person who saved them), and any measurement of Manus in AI answers until those questions are run.
