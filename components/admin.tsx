import Link from "next/link";
import { notFound } from "next/navigation";
import { databaseConfigured, requireAdmin } from "@/lib/auth";
import { count, desc, eq, sql } from "drizzle-orm";
import { database } from "@/lib/db";
import { apiUsage, users as userTable } from "@/lib/schema";

const pages = {
  overview: "Admin dashboard",
  usage: "API usage",
  statistics: "Application statistics",
  users: "User management",
  system: "System status",
} as const;
type Page = keyof typeof pages;
type Usage = {
  provider: string;
  characters: number;
  daily_characters: number;
  requests: number;
  daily_requests: number;
  input_tokens: number;
  output_tokens: number;
  successful_runs: number;
  failed_runs: number;
  estimated_cost: number | null;
};
type Stats = {
  users: number;
  scans: number;
  completed: number;
  partial: number;
  failed: number;
  usage: Usage[];
};

export async function Admin({
  section,
  page = 1,
}: {
  section: string;
  page?: number;
}) {
  await requireAdmin(section === "overview" ? "/admin" : "/admin/" + section);
  if (!Object.hasOwn(pages, section)) notFound();
  const current = section as Page;
  if (!databaseConfigured())
    return (
      <div className="card">
        <h1>Database setup required</h1>
        <p>Configure the database to access administrative reports.</p>
      </div>
    );
  const db = database();
  const now = new Date();
  const dayReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const monthReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1),
  );
  const stats = await db.execute<{ stats: Stats }>(
    sql`select public.admin_stats() as stats`,
  );
  const data = stats.rows[0].stats;
  const perPage = 25;
  const users =
    current === "users"
      ? await db
          .select()
          .from(userTable)
          .orderBy(desc(userTable.created_at), userTable.clerk_user_id)
          .limit(perPage)
          .offset((page - 1) * perPage)
      : null;
  const userCount =
    current === "users"
      ? (await db.select({ total: count() }).from(userTable))[0].total
      : 0;
  const next = page * perPage < userCount;
  const gemini = data.usage.find((item) => item.provider === "gemini");
  const remainder = (name: string, used: number) =>
    process.env[name]?.trim() && Number.isFinite(Number(process.env[name]))
      ? Math.max(0, Number(process.env[name]) - used).toLocaleString()
      : "Provider limit only";
  const failures =
    current === "system"
      ? await db
          .select({
            id: apiUsage.id,
            created_at: apiUsage.created_at,
            provider: apiUsage.provider,
            attempted_requests: apiUsage.attempted_requests,
          })
          .from(apiUsage)
          .where(eq(apiUsage.request_status, "failed"))
          .orderBy(desc(apiUsage.created_at))
          .limit(12)
      : null;
  return (
    <div className="stack">
      <div>
        <h1>{pages[current]}</h1>
        <p>Monitor Paper Checker usage and workspace health.</p>
      </div>
      <nav className="admin-nav" aria-label="Administration">
        {Object.entries(pages).map(([key, label]) => (
          <Link
            aria-current={current === key ? "page" : undefined}
            key={key}
            href={key === "overview" ? "/admin" : "/admin/" + key}
          >
            {label}
          </Link>
        ))}
      </nav>
      {(current === "overview" || current === "statistics") && (
        <div className="metrics">
          {[
            ["Workspace users", data.users],
            ["Total scans", data.scans],
            ["Complete", data.completed],
            ["Partial", data.partial],
            ["Failed", data.failed],
          ].map(([label, count]) => (
            <div className="card" key={label}>
              <p>{label}</p>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      )}
      {(current === "overview" || current === "usage") && (
        <section className="card stack">
          <div>
            <h2>Provider usage</h2>
            <p>Usage windows reset at midnight UTC.</p>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Provider",
                    "Daily characters",
                    "Monthly characters",
                    "Daily requests",
                    "Monthly requests",
                    "Monthly input tokens",
                    "Monthly output tokens",
                    "Successful runs",
                    "Failed runs",
                    "Estimated cost",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "gemini",
                  ...data.usage
                    .filter((item) => item.provider !== "gemini")
                    .map((item) => item.provider),
                ].map((provider) => {
                  const row = data.usage.find(
                    (item) => item.provider === provider,
                  );
                  return (
                    <tr key={provider}>
                      <th>
                        {provider === "gemini"
                          ? "Gemini"
                          : "Legacy detection API"}
                      </th>
                      {[
                        row?.daily_characters,
                        row?.characters,
                        row?.daily_requests,
                        row?.requests,
                        row?.input_tokens,
                        row?.output_tokens,
                        row?.successful_runs,
                        row?.failed_runs,
                      ].map((value, index) => (
                        <td key={index}>{(value ?? 0).toLocaleString()}</td>
                      ))}
                      <td>
                        {row?.estimated_cost == null
                          ? "—"
                          : "$" + Number(row.estimated_cost).toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <dl className="stats">
            <div>
              <dt>Gemini daily requests remaining</dt>
              <dd>
                {remainder(
                  "GEMINI_DAILY_REQUEST_LIMIT",
                  gemini?.daily_requests ?? 0,
                )}
              </dd>
            </div>
          </dl>
          <p>
            Next daily reset {dayReset.toISOString().slice(0, 10)} · Next
            monthly reset {monthReset.toISOString().slice(0, 10)}
          </p>
        </section>
      )}
      {current === "users" && (
        <section className="card stack">
          <h2>Workspace users</h2>
          <p>
            Workspace registration begins when a user saves an analysis or
            changes retention. Account and credential actions are managed in
            Clerk.
          </p>
          {users?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Joined (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.clerk_user_id}>
                      <td>{user.display_name ?? "—"}</td>
                      <td>{user.email ?? "—"}</td>
                      <td>{user.created_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No workspace users on this page.</p>
          )}
          <nav className="actions" aria-label="User pages">
            {page > 1 && (
              <Link href={"/admin/users?page=" + (page - 1)}>Previous</Link>
            )}
            <span>Page {page}</span>
            {next && <Link href={"/admin/users?page=" + (page + 1)}>Next</Link>}
          </nav>
        </section>
      )}
      {current === "system" && (
        <>
          <section className="card stack">
            <h2>System status</h2>
            <dl className="stats">
              {[
                ["Database", "Database responded"],
                ["Clerk", "Session verified"],
                ["AI detection", "Runs in the user’s browser"],
                [
                  "Gemini",
                  process.env.GEMINI_API_KEY
                    ? "Key configured"
                    : "Awaiting configuration",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card stack">
            <h2>Recent provider failures</h2>
            {failures?.length ? (
              <ul>
                {failures.map((failure) => (
                  <li key={failure.id}>
                    {failure.created_at.slice(0, 16).replace("T", " ")} UTC ·{" "}
                    {failure.provider === "gemini"
                      ? "Gemini"
                      : "Legacy detection API"}{" "}
                    · {failure.attempted_requests} attempted requests
                  </li>
                ))}
              </ul>
            ) : (
              <p>No recorded provider failures.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
