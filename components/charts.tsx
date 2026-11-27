"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export type Count = { name: string; count: number };
export type Trend = { name: string; ai: number | null; writing: number | null };
const green = "#168457",
  blue = "#4182a9";
const tooltip = {
  background: "var(--panel)",
  borderColor: "var(--line)",
  color: "var(--text)",
};
export function TrendChart({ data }: { data: Trend[] }) {
  return data.length ? (
    <div
      className="chart"
      role="img"
      aria-label="AI detection and writing quality scores over time"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="name"
            tickFormatter={(value) => String(value).slice(5)}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
          />
          <Tooltip contentStyle={tooltip} />
          <Legend />
          <Line
            name="AI detection"
            dataKey="ai"
            type="monotone"
            stroke={blue}
            strokeWidth={2}
          />
          <Line
            name="Writing quality"
            dataKey="writing"
            type="monotone"
            stroke={green}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <p className="chart-empty">
      Your score trends will appear after a successful analysis.
    </p>
  );
}
export function CountChart({ data, label }: { data: Count[]; label: string }) {
  return data.length ? (
    <div className="chart small" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
          />
          <Tooltip contentStyle={tooltip} />
          <Bar
            name="Count"
            dataKey="count"
            fill={green}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <p className="chart-empty">No data yet.</p>
  );
}
export function CompareChart({
  data,
}: {
  data: { name: string; first: number | null; second: number | null }[];
}) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Scores for the two selected documents"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis domain={[0, 100]} />
          <Tooltip contentStyle={tooltip} />
          <Legend />
          <Bar name="Baseline" dataKey="first" fill={blue} />
          <Bar name="Comparison" dataKey="second" fill={green} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
