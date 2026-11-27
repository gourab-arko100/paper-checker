import Link from "next/link";
import { FilePlus2, FileText } from "lucide-react";
import { databaseConfigured, requireUser } from "@/lib/auth";
import { sql } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { recent } from "@/lib/workspace";
import { scorePercent } from "@/lib/results";
import { Button } from "@/components/ui/button";
import {
  CountChart,
  TrendChart,
  type Trend,
  type Count,
} from "@/components/charts";
import { ScanTable } from "@/components/scan-table";
type Stats = {
  total: number;
  words: number;
  ai: number | null;
  writing: number | null;
  trend: Trend[];
  formats: Count[];
  issues: Count[];
};
export default async function Page() {
  const user = await requireUser("/dashboard");
  if (!databaseConfigured())
    return (
      <div className="card">
        <h1>Workspace setup required</h1>
        <p>Configure the database to open your dashboard.</p>
      </div>
    );
  const [stats, rows] = await Promise.all([
    withOwner(user.id, (db) => db.execute<{ stats: Stats }>(sql`select public.workspace_stats() as stats`)),
    recent(user.id),
  ]);
  const data = stats.rows[0].stats;
  return (
    <div className="stack">
      <div className="workspace-title">
        <div>
          <h1>Dashboard</h1>
          <p>Review your document analyses and writing trends.</p>
        </div>
        <Button asChild>
          <Link href="/analyze">
            <FilePlus2 size={18} /> New analysis
          </Link>
        </Button>
      </div>
      <div className="metrics">
        {[
          ["Documents analyzed", data.total.toLocaleString()],
          ["Average AI estimate", scorePercent(data.ai)],
          ["Average writing score", scorePercent(data.writing)],
          ["Words analyzed", data.words.toLocaleString()],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="card">
        <h2>Score trends</h2>
        <p>Daily averages over the past 30 days, UTC.</p>
        <TrendChart data={data.trend} />
      </section>
      <div className="feature-grid">
        <section className="card">
          <h2>Document formats</h2>
          <CountChart
            label="Document format distribution"
            data={data.formats}
          />
        </section>
        <section className="card">
          <h2>Common writing issues</h2>
          <CountChart label="Common writing issues" data={data.issues} />
        </section>
      </div>
      <section className="card">
        <div className="workspace-title">
          <h2>Recent scans</h2>
          <Button variant="ghost" asChild>
            <Link href="/history">View history</Link>
          </Button>
        </div>
        {rows.length ? (
          <ScanTable rows={rows} />
        ) : (
          <div className="empty">
            <FileText size={29} />
            <h3>No documents analyzed</h3>
            <p>Start with a paper, an assignment or pasted text.</p>
            <Button asChild>
              <Link href="/analyze">Analyze a document</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
