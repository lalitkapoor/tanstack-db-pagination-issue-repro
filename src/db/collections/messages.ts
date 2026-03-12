import {
  createCollection,
  extractSimpleComparisons,
  type LoadSubsetOptions,
} from "@tanstack/db";
import { persistedCollectionOptions } from "@tanstack/db-browser-wa-sqlite-persisted-collection";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import { fetchJson, persist } from "../http";
import type { DatabaseContext } from "../persistence";

type Message = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

type MessageQueryShape = {
  kind: "thread";
  threadId: string;
  before?: number;
  limit: number;
};

export class MessagesStore {
  private collectionInstance: ReturnType<
    MessagesStore["createCollection"]
  > | null = null;
  private internalFetchCount = 0;

  constructor(
    private readonly queryClient: QueryClient,
    private readonly databaseContext: DatabaseContext,
  ) {}

  private getQueryShape(opts: LoadSubsetOptions): MessageQueryShape {
    const comparisons = extractSimpleComparisons(opts.where);
    const threadId = comparisons.find((c) => c.field.join(".") === "threadId")
      ?.value as string | undefined;

    if (!threadId) {
      throw new Error("Message queries must include threadId");
    }

    const limit = opts.limit ?? 50;

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

    return {
      kind: "thread",
      threadId,
      before,
      limit,
    };
  }

  private async fetchMessages(opts: LoadSubsetOptions = {}) {
    this.internalFetchCount++;
    const query = this.getQueryShape(opts);

    const params = new URLSearchParams({
      limit: String(query.limit),
    });

    if (query.before != null) {
      params.set("before", String(query.before));
    }

    console.log("[messages queryFn]", {
      fetchCount: this.internalFetchCount,
      threadId: query.threadId,
      before: query.before ?? "none",
      limit: query.limit,
    });

    return fetchJson<Message[]>(
      `/api/threads/${query.threadId}/messages?${params}`,
    );
  }

  private createCollection() {
    const queryOpts = queryCollectionOptions({
      id: "messages",
      queryKey: (opts: LoadSubsetOptions) => {
        const comparisons = extractSimpleComparisons(opts.where);
        const threadId = comparisons.find(
          (c) => c.field.join(".") === "threadId",
        )?.value as string | undefined;

        if (!threadId) {
          // query-db-collection calls queryKey({}) during sync setup to establish a
          // base write/cache context key. This keeps that internal path safe without
          // treating unscoped message loads as valid fetches.
          return ["db", "messages"] as const;
        }

        const query = this.getQueryShape(opts);
        return [
          "db",
          "messages",
          "thread",
          query.threadId,
          query.before ?? "latest",
          query.limit,
        ] as const;
      },
      syncMode: "on-demand" as const,
      queryFn: (ctx) => this.fetchMessages(ctx.meta?.loadSubsetOptions ?? {}),
      queryClient: this.queryClient,
      getKey: (message) => message.id,
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await persist(
            `/api/threads/${mutation.modified.threadId}/messages`,
            "POST",
            mutation.modified,
          );
        }

        this.collection.utils.writeBatch(() => {
          for (const mutation of transaction.mutations) {
            this.collection.utils.writeInsert(mutation.modified);
          }
        });

        return { refetch: false };
      },
    });

    return createCollection(
      persistedCollectionOptions<
        Message,
        string,
        never,
        typeof queryOpts.utils
      >({
        ...queryOpts,
        persistence: this.databaseContext.createPersistence<Message>(),
        schemaVersion: 2,
      }),
    );
  }

  public init() {
    if (this.collectionInstance) {
      return this.collectionInstance;
    }

    this.collectionInstance = this.createCollection();
    return this.collectionInstance;
  }

  public get collection() {
    if (!this.collectionInstance) {
      throw new Error("Messages collection not initialized");
    }

    return this.collectionInstance;
  }

  public get fetchCount() {
    return this.internalFetchCount;
  }

  public add(content: string, threadId: string) {
    const id = crypto.randomUUID();

    this.collection.insert({
      id,
      threadId,
      role: "user",
      content,
      createdAt: Date.now(),
    });

    return id;
  }

  /** Insert a message from the server (SSE) into synced state without refetching. */
  public addServer(msg: {
    id: string;
    threadId: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
  }) {
    this.collection.utils.writeInsert({
      id: msg.id,
      threadId: msg.threadId,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    });
  }
}
