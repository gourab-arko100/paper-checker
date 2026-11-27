import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { bindOwner } from "../lib/owner-context";
import { apiUsage, preferences, retained, scans, users } from "../lib/schema";

async function fixture() {
  const pg = new PGlite();
  const db = drizzle(pg);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, pg };
}

type Transaction = Parameters<Parameters<PgliteDatabase["transaction"]>[0]>[0];
function scoped<T>(
  db: PgliteDatabase,
  user: string,
  run: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await bindOwner((statement) => tx.execute(statement), user);
    return run(tx);
  });
}

function add(tx: Transaction, owner: string, hash: string, name = "Paper") {
  return tx
    .insert(scans)
    .values({
      user_id: owner,
      document_name: name,
      document_type: "pdf",
      document_hash: hash.repeat(64),
      text_hash: "d".repeat(64),
      word_count: 3,
      character_count: 12,
      active_until: new Date(Date.now() + 120_000).toISOString(),
    })
    .returning();
}

function reserve(
  tx: Transaction,
  owner: string,
  scan: typeof scans.$inferSelect,
) {
  return tx.execute<{ id: string | null }>(sql`
    select public.reserve_quota(${owner}, ${scan.id}::uuid, ${scan.active_until}::timestamptz,
      'sapling', 12, 1, 20, 50, null) as id`);
}

function finish(
  tx: Transaction,
  owner: string,
  scan: typeof scans.$inferSelect,
  text: string,
) {
  return tx.execute<{ ok: boolean }>(sql`select public.finish_scan(
    ${owner}, ${scan.id}::uuid, ${scan.active_until}::timestamptz,
    ${JSON.stringify({ ai: { score: 0.2 }, ai_score: 0.2, status: "partial", processing_duration: 10 })}::jsonb,
    ${JSON.stringify({ text })}::jsonb
  ) as ok`);
}

test("Drizzle migrations install native RLS and prevent cross-user reads, writes, usage changes, and admin access", async () => {
  const { db, pg } = await fixture();
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    for (const id of ["clerk-a", "clerk-b"]) {
      await scoped(db, id, async (tx) => {
        await tx.insert(users).values({ clerk_user_id: id });
        await tx.execute(sql`select public.set_retention(${id}, true)`);
      });
    }
    const [a] = await scoped(db, "clerk-a", (tx) =>
      add(tx, "clerk-a", "a", "A private paper"),
    );
    const [b] = await scoped(db, "clerk-b", (tx) =>
      add(tx, "clerk-b", "a", "B private paper"),
    );
    const bQuota = await scoped(db, "clerk-b", (tx) =>
      reserve(tx, "clerk-b", b),
    );
    assert.ok(bQuota.rows[0].id);
    await scoped(db, "clerk-a", (tx) =>
      finish(tx, "clerk-a", a, "A private text"),
    );
    await scoped(db, "clerk-b", (tx) =>
      finish(tx, "clerk-b", b, "B private text"),
    );

    await scoped(db, "clerk-a", async (tx) => {
      // Deliberately omit application ownership predicates to exercise the database boundary.
      assert.deepEqual(
        (await tx.select().from(scans)).map((row) => row.id),
        [a.id],
      );
      assert.deepEqual(
        (await tx.select().from(retained)).map((row) => row.extracted_text),
        ["A private text"],
      );
      assert.deepEqual(
        await tx.select().from(scans).where(eq(scans.id, b.id)),
        [],
      );
      assert.deepEqual(
        await tx.select().from(retained).where(eq(retained.scan_id, b.id)),
        [],
      );
      assert.deepEqual(
        (await tx.select().from(users)).map((row) => row.clerk_user_id),
        ["clerk-a"],
      );
      assert.deepEqual(
        (await tx.select().from(preferences)).map((row) => row.user_id),
        ["clerk-a"],
      );
      assert.deepEqual(await tx.select().from(apiUsage), []);
      assert.deepEqual(
        await tx.delete(scans).where(eq(scans.id, b.id)).returning(),
        [],
      );
      assert.deepEqual(
        await tx
          .delete(users)
          .where(eq(users.clerk_user_id, "clerk-b"))
          .returning(),
        [],
      );
      assert.deepEqual(
        await tx
          .update(apiUsage)
          .set({ request_status: "success" })
          .where(eq(apiUsage.id, bQuota.rows[0].id!))
          .returning(),
        [],
      );
      assert.equal(
        (await finish(tx, "clerk-b", b, "forged")).rows[0].ok,
        false,
      );
      const stats = await tx.execute<{ stats: { total: number } }>(
        sql`select public.workspace_stats() as stats`,
      );
      assert.equal(stats.rows[0].stats.total, 1);
    });
    const denied = (error: unknown, reason: RegExp) => {
      assert.match(
        String(error instanceof Error ? (error.cause ?? error) : error),
        reason,
      );
      return true;
    };
    await assert.rejects(
      scoped(db, "clerk-a", (tx) => add(tx, "clerk-b", "c")),
      (e) => denied(e, /row-level security/),
    );
    await assert.rejects(
      scoped(db, "clerk-a", (tx) => reserve(tx, "clerk-b", b)),
      (e) => denied(e, /scan_unavailable/),
    );
    await assert.rejects(
      scoped(db, "clerk-a", (tx) =>
        tx.execute(sql`select public.admin_stats()`),
      ),
      (e) => denied(e, /permission denied/),
    );
    await assert.rejects(
      scoped(db, "clerk-a", (tx) =>
        tx.execute(sql`select public.set_retention('clerk-b', false)`),
      ),
      (e) => denied(e, /row-level security/),
    );
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role paperchecker_user`);
      assert.deepEqual(await tx.select().from(scans), []);
      assert.deepEqual(await tx.select().from(retained), []);
    });
    assert.equal((await db.select().from(scans)).length, 2);
    assert.equal(
      (await db.select().from(retained).where(eq(retained.scan_id, b.id)))[0]
        .extracted_text,
      "B private text",
    );
  } finally {
    await pg.close();
  }
});

test("Quota reservation, lease protection, privacy preferences and deletion remain transactional", async () => {
  const { db, pg } = await fixture();
  try {
    await db
      .insert(users)
      .values([{ clerk_user_id: "clerk-a" }, { clerk_user_id: "clerk-b" }]);
    await scoped(db, "clerk-a", (tx) =>
      tx.execute(sql`select public.set_retention('clerk-a', true)`),
    );
    const [a] = await scoped(db, "clerk-a", (tx) => add(tx, "clerk-a", "a"));
    const [b] = await scoped(db, "clerk-b", (tx) => add(tx, "clerk-b", "b"));
    await assert.rejects(
      scoped(db, "clerk-a", (tx) => add(tx, "clerk-a", "c")),
      (e: Error) => /active_scan/.test(String(e.cause)),
    );
    await assert.rejects(
      scoped(db, "clerk-a", (tx) =>
        reserve(tx, "clerk-a", {
          ...a,
          active_until: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
      (e: Error) => /scan_unavailable/.test(String(e.cause)),
    );
    const reservations = await Promise.all([
      scoped(db, "clerk-a", (tx) => reserve(tx, "clerk-a", a)),
      scoped(db, "clerk-b", (tx) => reserve(tx, "clerk-b", b)),
    ]);
    assert.equal(reservations.filter((result) => result.rows[0].id).length, 1);
    assert.deepEqual(
      await scoped(db, "clerk-b", (tx) =>
        tx.delete(scans).where(eq(scans.id, b.id)).returning(),
      ),
      [],
    );
    assert.equal(
      (
        await scoped(db, "clerk-a", (tx) =>
          finish(tx, "clerk-a", a, "Consented body"),
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await scoped(db, "clerk-b", (tx) =>
          finish(tx, "clerk-b", b, "No consent"),
        )
      ).rows[0].ok,
      true,
    );
    assert.equal((await db.select().from(retained)).length, 1);
    await scoped(db, "clerk-a", (tx) =>
      tx.execute(sql`select public.set_retention('clerk-a', false)`),
    );
    assert.equal((await db.select().from(retained)).length, 0);
    assert.equal(
      (
        await scoped(db, "clerk-a", (tx) =>
          tx
            .delete(scans)
            .where(and(eq(scans.id, a.id), eq(scans.user_id, "clerk-a")))
            .returning(),
        )
      ).length,
      1,
    );
    await scoped(db, "clerk-b", (tx) =>
      tx.delete(users).where(eq(users.clerk_user_id, "clerk-b")),
    );
    assert.equal((await db.select().from(scans)).length, 0);
    assert.equal(
      (await db.execute(sql`select public.admin_stats()`)).rows.length,
      1,
    );
  } finally {
    await pg.close();
  }
});
