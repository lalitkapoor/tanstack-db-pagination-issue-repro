import {
  createCollection,
  extractSimpleComparisons,
  type LoadSubsetOptions,
} from "@tanstack/db";
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import { fetchJson, persist } from "../http";
import { getPersistence } from "../persistence";

export type Message = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export let fetchCount = 0;

let _messages: ReturnType<typeof createMessagesCollection> | null = null;

function extractMessageQueryParams(opts: LoadSubsetOptions) {
  const comparisons = extractSimpleComparisons(opts.where);
  const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
    ?.value as string | undefined;

  let before: number | undefined;
  const cursor = (
    opts as LoadSubsetOptions & {
      cursor?: { whereFrom?: LoadSubsetOptions["where"] };
    }
  ).cursor;

  if (cursor?.whereFrom) {
    const cursorComparisons = extractSimpleComparisons(cursor.whereFrom);
    before = cursorComparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "lt",
    )?.value as number | undefined;
  } else {
    before = comparisons.find(
      (c) => c.field.join(".") === "createdAt" && c.operator === "lt",
    )?.value as number | undefined;
  }

  return { threadId, before };
}

async function fetchMessages(opts: LoadSubsetOptions = {}) {
  fetchCount++;
  const { threadId, before } = extractMessageQueryParams(opts);

  if (!threadId) {
    return [] as Message[];
  }

  const limit = opts.limit ?? 50;
  const params = new URLSearchParams({
    threadId,
    limit: String(limit),
  });

  if (before != null) {
    params.set("before", String(before));
  }

  console.log("[messages queryFn]", {
    fetchCount,
    threadId,
    before: before ?? "none",
    limit,
  });

  return fetchJson<Message[]>(`/api/messages?${params}`);
}

function createMessagesCollection(queryClient: QueryClient) {
  const queryOpts = queryCollectionOptions({
    id: "messages",
    queryKey: (opts: LoadSubsetOptions) => {
      const { threadId, before } = extractMessageQueryParams(opts);
      return ["db", "messages", threadId ?? null, before ?? "latest"] as const;
    },
    syncMode: "on-demand" as const,
    queryFn: (ctx) => fetchMessages(ctx.meta?.loadSubsetOptions ?? {}),
    queryClient,
    getKey: (message) => message.id,
    onInsert: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        await persist("/api/messages", "POST", mutation.modified);
      }

      if (_messages) {
        _messages.utils.writeBatch(() => {
          for (const mutation of transaction.mutations) {
            _messages?.utils.writeInsert(mutation.modified);
          }
        });
      }

      return { refetch: false };
    },
  });

  return createCollection(
    persistedCollectionOptions<Message, string, never, typeof queryOpts.utils>({
      ...queryOpts,
      persistence: getPersistence<Message>(),
      schemaVersion: 1,
    }),
  );
}

export async function initMessages(queryClient: QueryClient) {
  if (_messages) {
    return _messages;
  }

  _messages = createMessagesCollection(queryClient);
  await _messages.stateWhenReady();
  return _messages;
}

export function getMessages() {
  if (!_messages) {
    throw new Error("Messages collection not initialized");
  }

  return _messages;
}

export function addMessage(content: string, threadId: string = "thread-1") {
  const collection = getMessages();
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  collection.insert({
    id,
    threadId,
    role: "user",
    content,
    createdAt: Date.now(),
  });

  return id;
}

/** Insert a message from the server (SSE) into synced state without refetching. */
export function addServerMessage(msg: {
  id: string;
  threadId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}) {
  const collection = getMessages();

  collection.utils.writeInsert({
    id: msg.id,
    threadId: msg.threadId ?? "thread-1",
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
  });
}
