import type { TrackedCompany } from "./prompt-evals";

/** Folio-authored buyer scenarios. Tracked names are metadata, never prompt hints. */
export const EXPANDED_PROMPT_STARTERS = [
  {
    id: "authentication",
    name: "Authentication discovery",
    questions: [
      "A small team is building a Next.js SaaS app and needs email sign-in, social login, and account recovery. Which authentication options should we shortlist, and what tradeoffs would guide your choice?",
      "A B2B SaaS needs enterprise SSO and SCIM provisioning for its first larger customers. Which authentication or identity options would you consider, and what should we verify before choosing?",
      "We are building a multi-tenant SaaS where users can belong to several organizations with different roles. Which authentication and authorization options would you compare, and how would you assess tenant isolation and role management?",
    ],
    companies: [
      { name: "Clerk", aliases: ["clerk.com"] },
      { name: "Auth0", aliases: ["auth0.com"] },
      { name: "WorkOS", aliases: ["workos.com"] },
      { name: "Supabase", aliases: ["Supabase Auth", "supabase.com"] },
      { name: "Firebase", aliases: ["Firebase Authentication", "firebase.google.com"] },
      { name: "Better Auth", aliases: ["better-auth", "better-auth.com"] },
    ] satisfies TrackedCompany[],
  },
  {
    id: "browser-automation",
    name: "Browser automation discovery",
    questions: [
      "A small engineering team wants to run Playwright workflows in hosted browsers instead of maintaining browser infrastructure. Which services should we compare, and what operational tradeoffs matter?",
      "We are building an AI agent that needs to open pages, interact with forms, and inspect browser state. Which browser-session tools or services would you shortlist, and how would you choose between them?",
      "Our browser automation must resume authorized workflows using persisted login sessions without mixing customer accounts. Which tools or services would you evaluate, and what session security and lifecycle controls should we check?",
      "We need to run many independent browser workflows concurrently with useful failure diagnostics and predictable recovery. Which browser automation services should we evaluate, and how would you test their reliability before committing?",
    ],
    companies: [
      { name: "Browserbase", aliases: ["browserbase.com"] },
      { name: "Browser Use", aliases: ["browser-use", "browser-use.com"] },
      { name: "Steel", aliases: ["Steel Browser", "steel.dev"] },
      { name: "Anchor Browser", aliases: ["anchorbrowser.io"] },
      { name: "Bright Data", aliases: ["brightdata.com"] },
      { name: "Apify", aliases: ["apify.com"] },
    ] satisfies TrackedCompany[],
  },
];

/** Independently worded questions inspired by the public email discovery tasks,
 * not copied provider answers or measured Folio outcomes. */
export const EMAIL_DISCOVERY_STARTER = {
  name: "Transactional email discovery · September 2026",
  source: "https://lightsage.com/agent-experience-arena/resend",
  questions: [
    "For a small Next.js SaaS app, which service would you choose to deliver signup confirmations and password-reset messages? Explain your choice and two alternatives.",
    "A TypeScript SaaS needs to email invoices and subscription updates after payment webhooks. Which transactional email providers should we shortlist, and what tradeoffs matter?",
    "We need reliable team-invitation emails with reusable React templates and delivery logs. Which email API would you recommend for a startup, and why?",
  ],
  companies: [
    { name: "Resend", aliases: ["resend.com"] },
    { name: "SendGrid", aliases: ["Twilio SendGrid"] },
    { name: "Postmark", aliases: ["postmarkapp.com"] },
    { name: "Amazon SES", aliases: ["AWS SES", "Amazon Simple Email Service"] },
    { name: "Mailgun", aliases: ["mailgun.com"] },
    { name: "Brevo", aliases: ["Sendinblue"] },
  ] satisfies TrackedCompany[],
};

/** Existing illustrative Folio question library, retained as reusable prompts only. */
export const EXISTING_BUYER_QUESTIONS = [
  "What is the best project management tool for a small team?",
  "How can I organize team projects in one place?",
  "What are the best alternatives to Notion?",
  "Which productivity tools work best for startups?",
  "How much does Acme cost for a team of ten?",
];
