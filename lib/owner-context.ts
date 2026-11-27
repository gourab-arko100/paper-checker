import { sql, type SQL } from "drizzle-orm";

export async function bindOwner(
  execute: (statement: SQL) => PromiseLike<unknown>,
  clerkUserId: string,
) {
  if (!clerkUserId)
    throw new Error("An authenticated workspace owner is required.");
  await execute(sql`set local role paperchecker_user`);
  await execute(
    sql`select set_config('paperchecker.clerk_user_id', ${clerkUserId}, true)`,
  );
}
