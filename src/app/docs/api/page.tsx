import type { Metadata } from "next";
import { AgentApiReference } from "@/components/agent-api-reference";
export const metadata: Metadata = { title: "Folio Agent API — reference and keys", description: "Read saved website evaluations and request fresh Astra search observations from an owner-private API." };
export default function AgentApiPage() { return <AgentApiReference />; }
