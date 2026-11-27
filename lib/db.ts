import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { bindOwner } from "./owner-context";
import * as schema from "./schema";

let client: ReturnType<typeof connect> | undefined;

function connect(connectionString: string) {
  const pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 5000 });
  pool.on("error", () => {
    console.error("An idle database connection closed unexpectedly.");
  });
  return drizzle(pool, { schema });
}

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("The workspace database is awaiting configuration.");
  return (client ??= connect(url));
}

export type Db = ReturnType<typeof database>;
export type UserTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The identity must come from Clerk's verified server session or a signed deletion webhook.
export async function withOwner<T>(
  clerkUserId: string,
  run: (tx: UserTransaction) => Promise<T>,
): Promise<T> {
  return database().transaction(async (tx) => {
    await bindOwner((statement) => tx.execute(statement), clerkUserId);
    return run(tx);
  });
}
