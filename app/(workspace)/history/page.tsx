import Link from "next/link";
import { z } from "zod";
import { databaseConfigured, requireUser } from "@/lib/auth";
import { history } from "@/lib/workspace";
import { HistoryTable } from "@/components/history";
import { Button } from "@/components/ui/button";
const filters = z.object({
  q: z.string().max(150).optional(),
  type: z.enum(["pdf", "docx", "txt", "paste"]).optional(),
  sort: z.enum(["new", "old", "name", "ai", "writing"]).default("new"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  ai: z.coerce.number().min(0).max(100).optional(),
  writing: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/history");
  if (!databaseConfigured())
    return (
      <div className="card">
        <h1>Workspace setup required</h1>
        <p>Configure the database to open scan history.</p>
      </div>
    );
  const params = Object.fromEntries(
    Object.entries(await searchParams).filter(
      ([, value]) => typeof value === "string" && value !== "",
    ),
  );
  const parsed = filters.safeParse(params);
  const f = parsed.success
    ? parsed.data
    : ({ sort: "new", page: 1 } as z.infer<typeof filters>);
  const { rows, count } = await history(user.id, f);
  const pages = Math.max(1, Math.ceil(count / 12));
  const url = (next: number) => {
    const search = new URLSearchParams(params as Record<string, string>);
    search.set("page", String(next));
    return "/history?" + search.toString();
  };
  return (
    <div className="stack">
      <div className="workspace-title">
        <div>
          <h1>Scan history</h1>
          <p>Search, reopen or delete previous analyses.</p>
        </div>
        <Button asChild>
          <Link href="/analyze">New analysis</Link>
        </Button>
      </div>
      <form className="card filter-grid">
        <label className="field">
          Document name
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Search scans"
            maxLength={150}
          />
        </label>
        <label className="field">
          Format
          <select name="type" defaultValue={f.type ?? ""}>
            <option value="">All formats</option>
            {["pdf", "docx", "txt", "paste"].map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Sort by
          <select name="sort" defaultValue={f.sort}>
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="name">Document name</option>
            <option value="ai">Highest AI estimate</option>
            <option value="writing">Highest writing score</option>
          </select>
        </label>
        <label className="field">
          From date (UTC)
          <input type="date" name="from" defaultValue={f.from} />
        </label>
        <label className="field">
          Through date (UTC)
          <input type="date" name="to" defaultValue={f.to} />
        </label>
        <label className="field">
          Minimum AI estimate (%)
          <input
            type="number"
            name="ai"
            min={0}
            max={100}
            defaultValue={f.ai}
          />
        </label>
        <label className="field">
          Minimum writing score
          <input
            type="number"
            name="writing"
            min={0}
            max={100}
            defaultValue={f.writing}
          />
        </label>
        <div className="actions">
          <Button>Apply filters</Button>
          <Button variant="ghost" asChild>
            <Link href="/history">Reset</Link>
          </Button>
        </div>
      </form>
      {!parsed.success && (
        <p role="alert">
          Some filters were invalid. Showing unfiltered history.
        </p>
      )}
      <HistoryTable rows={rows} count={count} />
      <div className="actions pagination">
        {f.page > 1 && (
          <Button variant="outline" asChild>
            <Link href={url(Math.min(f.page - 1, pages))}>Previous</Link>
          </Button>
        )}
        <span>
          Page {f.page} of {pages}
        </span>
        {f.page < pages && (
          <Button variant="outline" asChild>
            <Link href={url(f.page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
