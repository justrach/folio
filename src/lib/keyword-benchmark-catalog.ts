import type { KeywordBenchmarkCaseInput } from "./keyword-benchmark-types";

// Reviewed public documentation corpus, 2026-09-13. These hosts are evidence
// sources, not execution providers. No site is created or published by a template.
export const KEYWORD_BENCHMARK_ALLOWED_DOMAINS = [
  "codegraff.com", "www.codegraff.com", "opencode.ai", "aider.chat",
  "developers.openai.com", "learn.chatgpt.com", "code.claude.com", "github.com",
] as const;

export const KEYWORD_BENCHMARK_TEMPLATES: readonly {
  id: string; name: string; description: string; cases: readonly KeywordBenchmarkCaseInput[];
}[] = [{
  id: "coding-harness-open-web-v1",
  name: "Coding harnesses · OpenAI web search",
  description: "Astra researches these questions with OpenAI live web search and no domain filter. Returned recommendation positions are observations of each answer, not a general engine ranking.",
  cases: [
    "Which open-source AI coding harnesses can run repository tasks from the terminal? Compare their model support, tools, and verification workflow.",
    "Which coding agents support multiple model providers for working on an existing codebase? Explain the practical trade-offs and source each recommendation.",
    "Which coding harnesses help verify whether an agent's code changes actually work? Compare their test execution and recorded evaluation evidence.",
  ].map(query => ({ query, targetUrl: "https://codegraff.com/", language: "English", locale: "United States",
    rubricVersion: "keyword-open-web-v1", searchMode: "open-web" as const })),
}, {
  id: "coding-harness-research-v1",
  name: "Coding harness research",
  description: "Three private research questions for an existing website. Compare recorded recommendations within a reviewed documentation corpus; this is not a product-quality leaderboard.",
  cases: [
    "Which open-source AI coding harnesses can run repository tasks from the terminal? Compare their model support, tools, and verification workflow.",
    "Which coding agents support multiple model providers for working on an existing codebase? Explain the practical trade-offs and source each recommendation.",
    "Which coding harnesses help verify whether an agent's code changes actually work? Compare their test execution and recorded evaluation evidence.",
  ].map(query => ({ query, targetUrl: "https://codegraff.com/", language: "English",
    locale: "United States", rubricVersion: "keyword-research-v1" })),
}];

const customerQuestionPacks = [
  {
    id: "small-team-work-v1", name: "Small teams · Work and collaboration",
    queries: [
      "Which project management tools work well for a small team planning tasks and sharing documents?",
      "Which small-team collaboration tools have useful free plans, and what are their main limits?",
      "Which project tools make it easy to work with clients without exposing internal work?",
      "Which work management tools offer clear setup instructions and migration help?",
      "Which collaboration tools support integrations with email, calendars, and shared files?",
      "When should a small team choose a simpler project tool instead of a larger work management platform?",
    ],
  },
  {
    id: "clothing-shopping-v1", name: "Shops and brands · Buying decisions",
    queries: [
      "What are good online brands for everyday basics and casual clothing in the United States?",
      "Which everyday clothing brands explain shipping costs and delivery times clearly?",
      "Which online clothing brands have straightforward return and exchange policies?",
      "Which clothing brands provide useful sizing and fit information before purchase?",
      "Which everyday clothing brands offer good value, and what evidence supports that comparison?",
      "Which clothing brands publish specific information about materials and product care?",
    ],
  },
  {
    id: "service-booking-v1", name: "Services · Availability and booking",
    queries: [
      "Which services help people find and book home cleaning in the United States?",
      "Which home-service booking platforms clearly explain where they operate?",
      "Which home-service platforms show pricing and additional fees before booking?",
      "Which home-service platforms explain cancellation, rescheduling, and refund terms clearly?",
      "What should customers compare when choosing a home-service booking platform?",
      "Which home-service platforms explain provider screening and how customers get help with a problem?",
    ],
  },
  {
    id: "learning-python-v1", name: "Learning · Course selection",
    queries: [
      "Where can a beginner learn Python online with structured courses?",
      "Which beginner Python courses include practical exercises and projects?",
      "Which online Python courses clearly explain prerequisites and expected study time?",
      "Which beginner Python courses are free, and when do learners have to pay?",
      "Which Python learning platforms offer feedback or support when a learner gets stuck?",
      "How should a beginner compare self-paced Python courses with instructor-led courses?",
    ],
  },
  {
    id: "ai-browsers-v1", name: "Agent products · Browsers and computer use",
    queries: [
      "AI agent that can use a real browser for me and show what it is doing",
      "agent that operates a desktop computer to finish a task",
      "browser agent that fills forms and downloads files unattended",
      "which AI agents can log into sites I already use and take over repetitive work",
      "agent product where I can take over the browser session at any point",
      "which browser agents keep a recording of every action they took",
    ],
  },
  {
    id: "coding-agents-v1", name: "Developer tools · Coding agents",
    queries: [
      "AI coding agent that works on my existing repository from the terminal",
      "coding agent that can run tests and prove its change works",
      "which coding agents support more than one model provider",
      "AI coding tool that reviews a pull request and leaves inline comments",
      "coding agent that can work in the cloud while I am away from my laptop",
      "which coding agents let me review and edit the plan before they start",
    ],
  },
  {
    id: "agent-interface-v1", name: "Agent products · Interface and control",
    queries: [
      "AI agent where I can watch it use a browser live",
      "agent dashboard to manage several tasks running at once",
      "AI agent that shows each step as it works",
      "AI workspace where I can preview files it creates",
      "AI agent that asks before it does something destructive",
      "tool to review and edit an agent's plan before it runs",
      "AI agent with a gallery of ready-made workflow templates",
      "AI agent I can check from my phone while it runs",
      "AI agent with scheduled recurring task setup in the UI",
      "shareable link to an agent session for a teammate",
      "AI agent with side-by-side comparison of two outputs",
      "AI tool with a clear cost or credit counter while it works",
    ],
  },
] as const;

// Each question becomes its own explicit sandbox observation. Saving a pack does not run it.
export const CUSTOMER_QUESTION_TEMPLATES = customerQuestionPacks.map(pack => ({
  id: pack.id, name: pack.name,
  description: `${pack.queries.length} customer questions covering discovery, comparison, practical details, and getting started. Edit them for your audience before evaluating.`,
  cases: pack.queries.map(query => ({ query, targetUrl: null, language: "English", locale: "United States",
    rubricVersion: "keyword-open-web-v1", searchMode: "open-web" as const })),
}));

export const ALL_KEYWORD_BENCHMARK_TEMPLATES = [...CUSTOMER_QUESTION_TEMPLATES, ...KEYWORD_BENCHMARK_TEMPLATES];
