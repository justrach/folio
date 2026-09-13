export const brands = [
  {
    name: "Notion",
    domain: "notion.so",
    letter: "N",
    color: "#292b27",
    score: 91.8,
    seo: 96,
    discovery: 89,
    change: 2,
    category: "Productivity",
  },
  {
    name: "Linear",
    domain: "linear.app",
    letter: "L",
    color: "#6265b3",
    score: 88.4,
    seo: 93,
    discovery: 86,
    change: 1,
    category: "Productivity",
  },
  {
    name: "Vercel",
    domain: "vercel.com",
    letter: "▲",
    color: "#262a26",
    score: 86.2,
    seo: 94,
    discovery: 81,
    change: 3,
    category: "Developer tools",
  },
  {
    name: "Webflow",
    domain: "webflow.com",
    letter: "W",
    color: "#3b66bc",
    score: 83.6,
    seo: 90,
    discovery: 80,
    change: -1,
    category: "Marketing",
  },
  {
    name: "Framer",
    domain: "framer.com",
    letter: "F",
    color: "#212d3b",
    score: 80.9,
    seo: 88,
    discovery: 77,
    change: 2,
    category: "Design",
  },
  {
    name: "Figma",
    domain: "figma.com",
    letter: "F",
    color: "#ba674a",
    score: 78.2,
    seo: 86,
    discovery: 74,
    change: -2,
    category: "Design",
  },
  {
    name: "Raycast",
    domain: "raycast.com",
    letter: "R",
    color: "#b85740",
    score: 75.6,
    seo: 82,
    discovery: 71,
    change: 1,
    category: "Productivity",
  },
  {
    name: "Acme",
    domain: "acme.com",
    letter: "a",
    color: "#326148",
    score: 72.8,
    seo: 86,
    discovery: 67,
    change: 4,
    category: "Productivity",
  },
  {
    name: "Tally",
    domain: "tally.so",
    letter: "T",
    color: "#806993",
    score: 68.3,
    seo: 78,
    discovery: 63,
    change: -1,
    category: "Productivity",
  },
  {
    name: "Cal.com",
    domain: "cal.com",
    letter: "C",
    color: "#282c28",
    score: 65.1,
    seo: 77,
    discovery: 59,
    change: 2,
    category: "Productivity",
  },
  {
    name: "Loops",
    domain: "loops.so",
    letter: "∞",
    color: "#cc8057",
    score: 62.7,
    seo: 75,
    discovery: 56,
    change: 0,
    category: "Marketing",
  },
  {
    name: "Resend",
    domain: "resend.com",
    letter: "R",
    color: "#3a3935",
    score: 59.4,
    seo: 72,
    discovery: 52,
    change: 1,
    category: "Developer tools",
  },
];

const aeo = [
  46, 48, 45, 51, 49, 52, 53, 50, 54, 58, 55, 60, 58, 61, 60, 65, 62, 64, 67,
  66, 70, 68, 69, 73, 70, 74, 71, 72.8,
];
export const trend = aeo.map((score, i) => ({
  day: i + 1,
  date: `${i < 15 ? "Aug" : "Sep"} ${i < 15 ? i + 17 : i - 14}`,
  aeo: score,
  seo: [
    68, 70, 69, 71, 72, 70, 73, 73, 74, 73, 76, 74, 76, 77, 75, 79, 78, 79, 81,
    80, 81, 82, 80, 84, 83, 85, 84, 86,
  ][i],
  industry: 42 + i * 0.47 + Math.sin(i) * 2,
}));

export const prompts = [
  {
    text: "What is the best project management tool for a small team?",
    intent: "Comparison",
    mentions: 4,
    total: 5,
    winner: "Linear",
    status: "Mentioned",
  },
  {
    text: "How can I organize team projects in one place?",
    intent: "Discovery",
    mentions: 5,
    total: 5,
    winner: "Acme",
    status: "Cited",
  },
  {
    text: "What are the best alternatives to Notion?",
    intent: "Alternative",
    mentions: 2,
    total: 5,
    winner: "Linear",
    status: "Mentioned",
  },
  {
    text: "Which productivity tools work best for startups?",
    intent: "Comparison",
    mentions: 3,
    total: 5,
    winner: "Notion",
    status: "Cited",
  },
  {
    text: "How much does Acme cost for a team of ten?",
    intent: "Purchase",
    mentions: 0,
    total: 5,
    winner: "Notion",
    status: "Absent",
  },
];

export const samplePatches = [
  {
    id: "answer-first",
    title: "Give AI a clearer first answer",
    target: "/index.html",
    type: "html",
    before: "Work, reimagined. Unlock the possibilities of a connected team.",
    after:
      "Acme is a project management workspace for small teams. Organize projects, assign tasks, and share documents in one place. Teams can start on the free plan and add collaboration features as they grow.",
    reason:
      "The opening paragraph describes the product directly, making the page easier to understand and quote.",
  },
  {
    id: "faq-schema",
    title: "Turn common questions into structured answers",
    target: "/faq.jsonld",
    type: "jsonld",
    before: "No FAQ structured data found.",
    after: JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is Acme?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Acme is a project management workspace for small teams.",
            },
          },
        ],
      },
      null,
      2,
    ),
    reason:
      "Add structured data for questions and answers that are also visible on the page. This does not guarantee a search feature.",
  },
  {
    id: "llms-txt",
    title: "Create a reading guide for your website",
    target: "/llms.txt",
    type: "text",
    before: "No llms.txt file found. This is an optional convention.",
    after:
      "# Acme\n\n> A project management workspace for small teams.\n\n## Product\n- [Overview](https://acme.com): Product introduction\n- [Documentation](https://acme.com/docs): Getting started and feature guides\n",
    reason:
      "An optional index of useful pages for readers that support llms.txt. Confirm these links before publishing.",
  },
];

export type Check = {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail" | "optional";
  detail: string;
  points: number;
  maxPoints: number;
};
export type Patch = (typeof samplePatches)[number];
export type Scan = {
  id: string;
  url: string;
  createdAt: string;
  seoScore: number;
  checks: Check[];
  title: string;
  description: string;
  wordCount: number;
  patches: Patch[];
};

export const sampleChecks: Check[] = [
  {
    id: "title",
    label: "Page title",
    status: "pass",
    detail:
      "Acme — A calmer way to manage your team's projects (52 characters).",
    points: 15,
    maxPoints: 15,
  },
  {
    id: "description",
    label: "Meta description",
    status: "pass",
    detail:
      "A descriptive summary is present and aligned with the page's purpose.",
    points: 15,
    maxPoints: 15,
  },
  {
    id: "h1",
    label: "One clear H1",
    status: "pass",
    detail: "A single primary heading describes the page.",
    points: 15,
    maxPoints: 15,
  },
  {
    id: "canonical",
    label: "Canonical URL",
    status: "pass",
    detail: "A self-referencing canonical URL is present.",
    points: 10,
    maxPoints: 10,
  },
  {
    id: "answer",
    label: "Answer-first introduction",
    status: "warning",
    detail:
      "The opening paragraph uses abstract language before explaining the product.",
    points: 6,
    maxPoints: 15,
  },
  {
    id: "schema",
    label: "Structured data",
    status: "warning",
    detail:
      "Organization schema is present. Relevant visible FAQs could be described with FAQPage schema.",
    points: 10,
    maxPoints: 15,
  },
  {
    id: "readability",
    label: "Readable page content",
    status: "pass",
    detail:
      "The page has 824 words of extractable text and a clear heading outline.",
    points: 15,
    maxPoints: 15,
  },
  {
    id: "llms",
    label: "llms.txt (optional)",
    status: "optional",
    detail:
      "Not present. This proposed convention is not required for SEO and does not affect the score.",
    points: 0,
    maxPoints: 0,
  },
];
