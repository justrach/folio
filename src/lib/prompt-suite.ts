import type { TrackedCompany } from "./prompt-evals";
import { EMAIL_DISCOVERY_STARTER, EXPANDED_PROMPT_STARTERS } from "./prompt-starters";

export type PromptSuiteCategory = {
  id: string;
  label: string;
  description: string;
  version: string;
  questions: string[];
  companies: TrackedCompany[];
};

/** Versioned question templates, not measured results or a company ranking.
 * Tracking metadata stays outside model input. New wording requires a new version. */
export const PROMPT_EVAL_SUITE: PromptSuiteCategory[] = [
  {
    id: "email",
    label: "Transactional email",
    description: "Signup messages, billing updates and team invitations.",
    version: "discovery-v1",
    questions: [...EMAIL_DISCOVERY_STARTER.questions],
    companies: EMAIL_DISCOVERY_STARTER.companies,
  },
  ...EXPANDED_PROMPT_STARTERS.map((starter) => ({
    id: starter.id,
    label: starter.id === "authentication" ? "Authentication" : "Browser automation",
    description: starter.id === "authentication"
      ? "Sign-in, enterprise identity and multi-tenant access."
      : "Hosted browsers, agent sessions and concurrent workflows.",
    version: "discovery-v1",
    questions: [...starter.questions],
    companies: starter.companies,
  })),
  {
    id: "analytics",
    label: "Analytics",
    description: "Funnels, retention and privacy-conscious measurement.",
    version: "discovery-v1",
    questions: [
      "A small SaaS team wants to understand where new users abandon onboarding. Which product analytics tools should we shortlist, and what would make the setup useful in the first week?",
      "We need to compare retention across customer cohorts in a web and mobile product. Which analytics platforms would you evaluate, and what event design mistakes should we avoid?",
      "A European product team wants useful usage analytics while minimizing personal data collection. Which tools should it compare, and what privacy and hosting controls should it verify?",
      "Our product has both individual users and business accounts. Which analytics tools can help us understand account-level adoption, and how should we test their suitability before migrating?",
    ],
    companies: [
      { name: "PostHog", aliases: ["posthog.com"] },
      { name: "Mixpanel", aliases: ["mixpanel.com"] },
      { name: "Amplitude", aliases: ["amplitude.com"] },
      { name: "Heap", aliases: ["heap.io"] },
      { name: "Plausible", aliases: ["plausible.io"] },
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Errors, traces, incident response and logging costs.",
    version: "discovery-v1",
    questions: [
      "A startup needs to catch production errors in a TypeScript frontend and Node.js API. Which monitoring tools would you shortlist, and how would you reduce noisy alerts?",
      "Our application spans several services and slow requests are difficult to investigate. Which observability platforms should we compare for distributed tracing, and what should a pilot measure?",
      "A small on-call team needs logs, uptime checks and actionable incident alerts without a dedicated infrastructure engineer. Which services would you consider, and what tradeoffs matter?",
      "Our logging bill grows faster than traffic. Which observability tools or approaches should we evaluate to control costs while preserving enough evidence to debug incidents?",
    ],
    companies: [
      { name: "Sentry", aliases: ["sentry.io"] },
      { name: "Datadog", aliases: ["datadoghq.com"] },
      { name: "New Relic", aliases: ["newrelic.com"] },
      { name: "Grafana", aliases: ["grafana.com"] },
      { name: "Better Stack", aliases: ["betterstack.com"] },
    ],
  },
  {
    id: "hosting",
    label: "Application hosting",
    description: "Web deployment, background workers and infrastructure growth.",
    version: "discovery-v1",
    questions: [
      "A two-person team is launching a Next.js application with server-rendered pages. Which hosting services should we compare for deployment simplicity, performance and predictable costs?",
      "Our web application needs an API, scheduled tasks and long-running background workers. Which hosting platforms would you shortlist, and what limits should we check before choosing?",
      "We need preview environments for pull requests and a reliable rollback path for production. Which application hosting services would you evaluate, and how would you test that workflow?",
      "A growing SaaS needs to serve customers across regions without hiring a large operations team. Which hosting options should we consider, and how should we compare reliability, data location and migration effort?",
    ],
    companies: [
      { name: "Vercel", aliases: ["vercel.com"] },
      { name: "Netlify", aliases: ["netlify.com"] },
      { name: "Cloudflare", aliases: ["cloudflare.com"] },
      { name: "Render", aliases: ["render.com"] },
      { name: "Railway", aliases: ["railway.com", "railway.app"] },
      { name: "Fly.io", aliases: [] },
    ],
  },
  {
    id: "databases",
    label: "Managed databases",
    description: "Relational storage, recovery and development branches.",
    version: "discovery-v1",
    questions: [
      "A small SaaS team needs managed PostgreSQL with straightforward backups and connection pooling. Which database services should we shortlist, and what should we verify before storing customer data?",
      "We want isolated database branches for preview environments without copying production personal data. Which managed database options would you compare, and what workflow would you test?",
      "Our application has unpredictable traffic and long quiet periods. Which managed relational database services would you consider, and how would you evaluate cold starts, connection limits and billing?",
      "A growing multi-tenant application needs stronger recovery guarantees and a low-risk database migration. Which managed database providers should we evaluate, and what recovery drills should inform the decision?",
    ],
    companies: [
      { name: "Neon", aliases: ["neon.tech"] },
      { name: "Supabase", aliases: ["supabase.com"] },
      { name: "Amazon RDS", aliases: ["AWS RDS"] },
      { name: "Google Cloud SQL", aliases: ["Cloud SQL"] },
      { name: "Crunchy Data", aliases: ["Crunchy Bridge"] },
    ],
  },
  {
    id: "search",
    label: "Search",
    description: "Catalog search, relevance, permissions and indexing.",
    version: "discovery-v1",
    questions: [
      "An online catalog needs fast typo-tolerant search with filters and useful ranking. Which search tools should we compare, and how would you evaluate relevance using real customer queries?",
      "A SaaS app needs search across private team documents with strict permission checks. Which search platforms would you shortlist, and how would you test access isolation?",
      "We want to combine keyword matching and semantic retrieval for a technical documentation site. Which search services would you evaluate, and what evidence would justify the added complexity?",
      "Our searchable content changes frequently and stale results confuse users. Which search platforms should we consider, and how should we compare indexing latency, failure recovery and operational effort?",
    ],
    companies: [
      { name: "Algolia", aliases: ["algolia.com"] },
      { name: "Typesense", aliases: ["typesense.org"] },
      { name: "Meilisearch", aliases: ["meilisearch.com"] },
      { name: "Elastic", aliases: ["Elasticsearch", "elastic.co"] },
      { name: "OpenSearch", aliases: ["opensearch.org"] },
    ],
  },
  {
    id: "support",
    label: "Customer support",
    description: "Shared inboxes, knowledge bases and customer context.",
    version: "discovery-v1",
    questions: [
      "A small SaaS team handles customer questions through scattered email threads. Which support platforms should we shortlist for a shared inbox and clear ownership, and what would keep the workflow simple?",
      "We need a help center and in-app support chat that work together. Which customer support tools would you compare, and how would you evaluate the experience for both customers and agents?",
      "Our B2B customers expect response-time commitments and support history tied to their accounts. Which helpdesk platforms should we evaluate, and what reporting and integration capabilities matter?",
      "An ecommerce team needs to handle order questions across email and chat without losing context. Which support tools should it consider, and how would you test handoffs, access controls and cost?",
    ],
    companies: [
      { name: "Intercom", aliases: ["intercom.com"] },
      { name: "Zendesk", aliases: ["zendesk.com"] },
      { name: "Help Scout", aliases: ["helpscout.com"] },
      { name: "Freshdesk", aliases: ["freshdesk.com"] },
      { name: "Gorgias", aliases: ["gorgias.com"] },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    description: "Sales pipelines, account context and migration.",
    version: "discovery-v1",
    questions: [
      "A founder-led B2B startup wants to replace its sales spreadsheet with a CRM. Which products should we shortlist, and what would make one easy to maintain as the team grows?",
      "Our sales team needs reliable email activity capture and a clear pipeline without extensive manual entry. Which CRM tools would you evaluate, and how should we test data quality and adoption?",
      "A services business needs to track long sales cycles involving several contacts at each company. Which CRM platforms would you compare, and what relationship and reporting features matter?",
      "We are migrating an existing sales database and need flexible fields, a usable API and clean exports. Which CRM options should we consider, and how would you assess migration effort and future portability?",
    ],
    companies: [
      { name: "HubSpot", aliases: ["hubspot.com"] },
      { name: "Salesforce", aliases: ["salesforce.com"] },
      { name: "Pipedrive", aliases: ["pipedrive.com"] },
      { name: "Attio", aliases: ["attio.com"] },
      { name: "Zoho CRM", aliases: ["zoho.com/crm"] },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    description: "Subscriptions, usage billing and international checkout.",
    version: "discovery-v1",
    questions: [
      "A small software business wants to sell subscriptions internationally. Which payment and billing providers should it compare, and how should it assess tax responsibilities and merchant-of-record options?",
      "Our SaaS needs usage-based billing with clear invoices and dependable payment webhooks. Which billing platforms would you shortlist, and what edge cases should we test before launching?",
      "An online business needs checkout with cards and relevant local payment methods in several countries. Which payment providers should we evaluate, and how should geography influence the decision?",
      "We need to manage subscription upgrades, failed payments and customer self-service without building every billing workflow ourselves. Which services would you consider, and what would you verify in a pilot?",
    ],
    companies: [
      { name: "Stripe", aliases: ["stripe.com"] },
      { name: "Paddle", aliases: ["paddle.com"] },
      { name: "Lemon Squeezy", aliases: ["lemonsqueezy.com"] },
      { name: "Chargebee", aliases: ["chargebee.com"] },
      { name: "Adyen", aliases: ["adyen.com"] },
    ],
  },
  {
    id: "feature-flags",
    label: "Feature flags",
    description: "Gradual releases, targeting and flag lifecycle.",
    version: "discovery-v1",
    questions: [
      "A small engineering team wants to release features gradually and disable them quickly if errors rise. Which feature flag tools should we compare, and what would make the rollout process reliable?",
      "Our SaaS needs feature targeting by customer account across frontend and backend services. Which flag management platforms would you shortlist, and how would you test consistent decisions?",
      "We want to run product experiments while keeping exposure tracking and analysis understandable. Which feature management tools should we evaluate, and what measurement risks should we consider?",
      "A larger team has accumulated stale feature flags and unclear ownership. Which feature management platforms would you consider for governance, and what lifecycle controls should we verify?",
    ],
    companies: [
      { name: "LaunchDarkly", aliases: ["launchdarkly.com"] },
      { name: "Statsig", aliases: ["statsig.com"] },
      { name: "Unleash", aliases: ["getunleash.io"] },
      { name: "Flagsmith", aliases: ["flagsmith.com"] },
      { name: "GrowthBook", aliases: ["growthbook.io"] },
    ],
  },
  {
    id: "commerce",
    label: "Online stores",
    description: "Catalogs, checkout, inventory and selling across channels.",
    version: "discovery-v1",
    questions: [
      "An independent retailer wants to launch an online store without a development team. Which ecommerce platforms should it compare, and what should it check about setup effort, transaction fees and exporting its catalog?",
      "A growing brand sells both online and in a physical shop. Which commerce platforms should it shortlist, and how should it test stock synchronization, returns and customer records?",
      "A business sells products with many variants and wants to expand into several countries. Which store platforms would you evaluate, and what should a pilot verify about currencies, tax settings and localized catalogs?",
      "An established online store wants to migrate without losing product URLs or order history. Which ecommerce platforms should it consider, and what migration and checkout tests would reduce disruption?",
    ],
    companies: [
      { name: "Shopify", aliases: ["shopify.com"] },
      { name: "WooCommerce", aliases: ["woocommerce.com"] },
      { name: "BigCommerce", aliases: ["bigcommerce.com"] },
      { name: "Squarespace", aliases: ["squarespace.com"] },
      { name: "Wix", aliases: ["wix.com"] },
    ],
  },
  {
    id: "scheduling",
    label: "Appointment scheduling",
    description: "Bookings, reminders, time zones and team availability.",
    version: "discovery-v1",
    questions: [
      "An independent consultant wants clients to book appointments without exchanging emails. Which scheduling tools should they shortlist, and what should they verify about calendar conflicts and time zones?",
      "A services team needs to assign incoming bookings among several staff members. Which scheduling platforms should it compare, and how would it test routing rules, availability and reassignment?",
      "A small studio sells appointments and group classes with cancellation rules. Which booking platforms would you evaluate, and what should you check about payments, reminders and rescheduling?",
      "A distributed sales team wants booking links that work with its calendars and CRM. Which scheduling services should it consider, and how would you evaluate privacy settings and integration reliability?",
    ],
    companies: [
      { name: "Calendly", aliases: ["calendly.com"] },
      { name: "Cal.com", aliases: [] },
      { name: "Acuity Scheduling", aliases: ["acuityscheduling.com"] },
      { name: "YouCanBookMe", aliases: ["youcanbook.me"] },
      { name: "SimplyBook.me", aliases: [] },
    ],
  },
  {
    id: "email-marketing",
    label: "Email marketing",
    description: "Newsletters, audience consent and campaign automation.",
    version: "discovery-v1",
    questions: [
      "A small business wants to start a newsletter for customers who explicitly subscribe. Which email marketing tools should it compare, and what should it check about consent records, unsubscribes and contact exports?",
      "An online retailer needs segmented campaigns and automated follow-ups after purchases. Which email marketing platforms would you shortlist, and how should you test the store integration and suppression rules?",
      "A creator wants to grow a newsletter and sell digital products. Which audience and email platforms should they evaluate, and what pricing and portability tradeoffs matter as the list grows?",
      "A nonprofit has a small communications team and a limited budget. Which newsletter services should it consider, and how would you compare accessible templates, reporting and ease of use?",
    ],
    companies: [
      { name: "Mailchimp", aliases: ["mailchimp.com"] },
      { name: "Klaviyo", aliases: ["klaviyo.com"] },
      { name: "Kit", aliases: ["ConvertKit", "kit.com"] },
      { name: "MailerLite", aliases: ["mailerlite.com"] },
      { name: "Brevo", aliases: ["brevo.com"] },
    ],
  },
  {
    id: "project-management",
    label: "Project management",
    description: "Team planning, client work and cross-functional delivery.",
    version: "discovery-v1",
    questions: [
      "A small team is losing track of tasks across chats and spreadsheets. Which project management tools should it shortlist, and what would make the first month of adoption manageable?",
      "A services agency needs to coordinate client projects with deadlines, approvals and restricted guest access. Which project planning tools should it compare, and how would it test those workflows?",
      "An engineering team wants to connect issue tracking with product planning without maintaining duplicate records. Which work management platforms would you evaluate, and what integrations and reporting should you verify?",
      "A distributed organization needs visibility across projects while teams retain their own workflows. Which collaboration platforms should it consider, and how should it assess permissions, dependencies and export options?",
    ],
    companies: [
      { name: "Asana", aliases: ["asana.com"] },
      { name: "Trello", aliases: ["trello.com"] },
      { name: "Monday.com", aliases: [] },
      { name: "ClickUp", aliases: ["clickup.com"] },
      { name: "Linear", aliases: ["linear.app"] },
      { name: "Notion", aliases: ["notion.so", "notion.com"] },
    ],
  },
  {
    id: "accounting",
    label: "Business accounting",
    description: "Invoicing, reconciliation and accountant collaboration.",
    version: "discovery-v1",
    questions: [
      "A freelance designer wants to replace invoice spreadsheets with accounting software. Which tools should they compare, and what should they verify about local availability, recurring invoices and data exports?",
      "A small business needs to reconcile bank transactions and share records with its accountant. Which bookkeeping platforms would you shortlist, and how would you test bank-feed coverage and collaboration permissions?",
      "An agency invoices clients in several currencies and tracks reimbursable expenses. Which accounting services should it evaluate, and what currency, approval and reporting limitations should it check?",
      "A growing company wants to migrate from basic bookkeeping software with minimal disruption. Which accounting platforms should it consider, and how should it validate opening balances, audit history and integrations?",
    ],
    companies: [
      { name: "QuickBooks", aliases: ["quickbooks.intuit.com"] },
      { name: "Xero", aliases: ["xero.com"] },
      { name: "FreshBooks", aliases: ["freshbooks.com"] },
      { name: "Zoho Books", aliases: ["zoho.com/books"] },
      { name: "Wave", aliases: ["waveapps.com"] },
    ],
  },
  {
    id: "community",
    label: "Community platforms",
    description: "Member discussions, paid groups and community moderation.",
    version: "discovery-v1",
    questions: [
      "A creator wants a dedicated space for member discussions and paid community access. Which community platforms should they compare, and what should they check about moderation, payments and member exports?",
      "A software company wants a searchable customer discussion forum alongside its help center. Which community tools would you shortlist, and how would you assess sign-in integration and knowledge discovery?",
      "A professional association wants members to organize events and maintain smaller interest groups. Which community platforms should it evaluate, and what accessibility and administrator controls should it verify?",
      "A growing online group wants to move away from noisy chat channels while keeping members engaged. Which community services should it consider, and how would it test migration, notifications and long-term content access?",
    ],
    companies: [
      { name: "Circle", aliases: ["circle.so"] },
      { name: "Mighty Networks", aliases: ["mightynetworks.com"] },
      { name: "Discourse", aliases: ["discourse.org"] },
      { name: "Discord", aliases: ["discord.com"] },
      { name: "Bettermode", aliases: ["bettermode.com"] },
    ],
  },
];
