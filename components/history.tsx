"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { ScanTable } from "./scan-table";
import type { ScanRow } from "@/lib/workspace";
export function HistoryTable({
  rows,
  count,
}: {
  rows: ScanRow[];
  count: number;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [action, setAction] = useState<"selected" | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const selected = ids.filter((id) => rows.some((row) => row.id === id));
  async function remove() {
    setBusy(true);
    try {
      const response = await fetch("/api/scans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "all" ? { all: true } : { ids: selected },
        ),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast.success(
        result.deleted +
          " scan(s) deleted" +
          (result.active ? " · active scans were kept" : ""),
      );
      setIds([]);
      setAction(null);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Deletion failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="workspace-title">
        <h2>
          Saved scans <small>({count})</small>
        </h2>
        <div className="actions">
          <Button
            variant="outline"
            disabled={!selected.length || busy}
            onClick={() => setAction("selected")}
          >
            Delete selected{selected.length ? " (" + selected.length + ")" : ""}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setAction("all")}
          >
            Clear history
          </Button>
        </div>
      </div>
      {action && (
        <div className="notice" role="alert">
          <div>
            <strong>
              {action === "all"
                ? "Permanently delete all scan history?"
                : "Permanently delete the selected scans?"}
            </strong>
            <p>Saved reports and their retained text will be removed.</p>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void remove()}>
              Confirm deletion
            </Button>
          </div>
        </div>
      )}
      {rows.length ? (
        <ScanTable
          rows={rows}
          selection={{
            ids: selected,
            toggle: (id) =>
              setIds((values) =>
                values.includes(id)
                  ? values.filter((value) => value !== id)
                  : [...values, id],
              ),
          }}
        />
      ) : (
        <div className="empty">
          <h3>No matching scans</h3>
          <p>Change the filters or start a new document analysis.</p>
        </div>
      )}
    </section>
  );
}
