import type {
  CareerContext,
  Conversation,
  ReasoningLens,
  SendMessageResponse,
} from "./types";

const API_BASE =
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL) ||
  "http://localhost:3001";

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // ── Career context ────────────────────────────────────────────────

  getContext: () => request<CareerContext | null>("/api/context"),

  saveContext: (data: CareerContext) =>
    request<CareerContext>("/api/context", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── Conversations ──────────────────────────────────────────────────

  createConversation: (title?: string) =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  listConversations: () =>
    request<Conversation[]>("/api/conversations"),

  getConversation: (id: string) =>
    request<Conversation>(`/api/conversations/${id}`),

  // ── Messages ───────────────────────────────────────────────────────

  sendMessage: (
    conversationId: string,
    content: string,
    lens: ReasoningLens = "coach",
  ) =>
    request<SendMessageResponse>(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content, lens }),
      },
    ),

  // ── Health ─────────────────────────────────────────────────────────

  health: () =>
    request<{ status: string; provider: string; database: string }>(
      "/api/health",
    ),
};
