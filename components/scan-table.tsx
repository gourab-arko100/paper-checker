import Link from "next/link";
import { FileText } from "lucide-react";
import { scorePercent } from "@/lib/results";
import type { ScanRow } from "@/lib/workspace";
export function ScanTable({
  rows,
  selection,
}: {
  rows: ScanRow[];
  selection?: { ids: string[]; toggle: (id: string) => void };
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {selection && <th scope="col">Select</th>}
            <th scope="col">Document</th>
            <th scope="col">Date</th>
            <th scope="col">Words</th>
            <th scope="col">Characters</th>
            <th scope="col">Pages</th>
            <th scope="col">AI estimate</th>
            <th scope="col">Writing</th>
            <th scope="col">Duration</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {selection && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Select " + row.document_name}
                    checked={selection.ids.includes(row.id)}
                    onChange={() => selection.toggle(row.id)}
                  />
                </td>
              )}
              <td>
                <Link className="table-document" href={"/results/" + row.id}>
                  <FileText size={18} />
                  <span>
                    {row.document_name}
                    <small>{row.document_type.toUpperCase()}</small>
                  </span>
                </Link>
              </td>
              <td>{new Date(row.created_at).toISOString().slice(0, 10)}</td>
              <td>{row.word_count.toLocaleString()}</td>
              <td>{row.character_count.toLocaleString()}</td>
              <td>{row.page_count ?? "—"}</td>
              <td>{scorePercent(row.ai_score, 100)}</td>
              <td>{scorePercent(row.writing_score)}</td>
              <td>{(row.processing_duration / 1000).toFixed(1)}s</td>
              <td>
                <span className={"status " + row.status}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
