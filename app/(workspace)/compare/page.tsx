import { z } from "zod";
import { databaseConfigured, requireUser } from "@/lib/auth";
import { CompareChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { comparisons, type ComparisonRow } from "@/lib/workspace";
const ids = z.object({ a: z.uuid(), b: z.uuid() });
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser("/compare");
  if (!databaseConfigured())
    return (
      <div className="card">
        <h1>Workspace setup required</h1>
        <p>Configure the database to compare scans.</p>
      </div>
    );
  const raw = await searchParams;
  const selected = ids.safeParse(raw);
  const requestedPage = Math.max(
    1,
    Math.min(10000, Number.parseInt(raw.page ?? "1", 10) || 1),
  );
  const { options, selected: scans, count } = await comparisons(
    user.id, requestedPage, selected.success ? [selected.data.a, selected.data.b] : [],
  );
  const choices = new Map([...options, ...scans].map((item) => [item.id, item]));
  const a = selected.success ? scans.find((item) => item.id === selected.data.a) : undefined;
  const b = selected.success ? scans.find((item) => item.id === selected.data.b) : undefined;
  const metrics =
    a && b
      ? [
          {
            name: "AI estimate",
            first: a.ai_score === null ? null : Math.round(a.ai_score * 100),
            second: b.ai_score === null ? null : Math.round(b.ai_score * 100),
          },
          {
            name: "Writing quality",
            first: a.writing_score,
            second: b.writing_score,
          },
          {
            name: "Academic tone",
            first: a.writing?.scores.tone ?? null,
            second: b.writing?.scores.tone ?? null,
          },
          {
            name: "Readability",
            first: a.writing?.scores.readability ?? null,
            second: b.writing?.scores.readability ?? null,
          },
          {
            name: "Coherence",
            first: a.writing?.scores.coherence ?? null,
            second: b.writing?.scores.coherence ?? null,
          },
        ]
      : [];
  const grammar = (scan: ComparisonRow) =>
    scan.writing?.issues.filter((issue) =>
      ["grammar", "spelling", "punctuation"].includes(issue.category),
    ).length ?? null;
  const delta = (first: number | null, second: number | null) =>
    first === null || second === null
      ? "—"
      : (second > first ? "+" : "") + (second - first);
  const maxPages = Math.max(1, Math.ceil(count / 100));
  return (
    <div className="stack">
      <div className="workspace-title">
        <div>
          <h1>Compare documents</h1>
          <p>Compare two saved analyses or two versions of your draft.</p>
        </div>
      </div>
      <form className="card filter-grid">
        <input type="hidden" name="page" value={requestedPage} />
        {[
          ["a", "Baseline"],
          ["b", "Comparison"],
        ].map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <select name={key} defaultValue={raw[key] ?? ""} required>
              <option value="">Select a document</option>
              {[...choices.values()].map((item) => (
                <option key={item.id} value={item.id}>
                  {item.document_name} · {item.created_at.slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div>
          <Button disabled={choices.size < 2}>Compare documents</Button>
        </div>
      </form>
      {maxPages > 1 && (
        <form className="actions">
          <input type="hidden" name="a" value={raw.a ?? ""} />
          <input type="hidden" name="b" value={raw.b ?? ""} />
          <span>
            Document list {requestedPage} of {maxPages}
          </span>
          <Button
            variant="outline"
            name="page"
            value={requestedPage - 1}
            disabled={requestedPage <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            name="page"
            value={requestedPage + 1}
            disabled={requestedPage >= maxPages}
          >
            Next
          </Button>
        </form>
      )}
      {a && b && a.id !== b.id ? (
        <>
          <section className="card">
            <h2>Score comparison</h2>
            <CompareChart data={metrics} />
          </section>
          <section className="card">
            <h2>Comparison summary</h2>
            <p>
              Changes describe the providers’ estimates. Writing improvements
              require review in context.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>{a.document_name}</th>
                    <th>{b.document_name}</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...metrics,
                    {
                      name: "Words",
                      first: a.word_count,
                      second: b.word_count,
                    },
                    {
                      name: "Grammar and mechanics issues",
                      first: grammar(a),
                      second: grammar(b),
                    },
                  ].map((item) => (
                    <tr key={item.name}>
                      <th>{item.name}</th>
                      <td>{item.first ?? "—"}</td>
                      <td>{item.second ?? "—"}</td>
                      <td>{delta(item.first, item.second)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="card empty">
          <h3>
            {selected.success
              ? "Choose two different available reports"
              : choices.size < 2
                ? "Add another analysis to compare"
                : "Select two documents"}
          </h3>
          <p>Completed and partial analyses can be compared.</p>
        </div>
      )}
    </div>
  );
}
