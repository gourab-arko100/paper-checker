"use client";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "./ui/button";
export function Settings({ initial }: { initial: boolean }) {
  const clerk = useClerk();
  const { theme, setTheme } = useTheme();
  const [retain, setRetain] = useState(initial);
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  async function update(next: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retain: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRetain(data.retain);
      toast.success("Privacy preferences saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Preferences could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirm }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      await clerk.signOut({ redirectUrl: "/" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Account deletion failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack narrow">
      <div>
        <h1>Settings</h1>
        <p>Manage your profile, appearance and document retention.</p>
      </div>
      <section className="card stack">
        <h2>Profile and sessions</h2>
        <p>Manage your email addresses, sign-in methods and active sessions.</p>
        <div className="actions">
          <Button onClick={() => clerk.openUserProfile()}>
            Manage account
          </Button>
          <Button
            variant="outline"
            onClick={() => void clerk.signOut({ redirectUrl: "/" })}
          >
            Sign out
          </Button>
        </div>
      </section>
      <section className="card stack">
        <h2>Appearance</h2>
        <label className="field">
          Theme
          <select
            value={theme ?? "system"}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
      <section className="card stack">
        <h2>Text retention</h2>
        <p>
          Enable retention to save extracted text, quotations and detailed
          writing feedback in future reports. Turning it off deletes previously
          retained text and detailed feedback.
        </p>
        <label className="consent">
          <input
            type="checkbox"
            checked={retain}
            disabled={busy}
            onChange={(event) => void update(event.target.checked)}
          />{" "}
          Save extracted text and detailed feedback
        </label>
      </section>
      <section className="card stack">
        <h2>Delete account</h2>
        <p>
          Delete your Clerk account, scans and saved text. Aggregate provider
          usage is kept without your account or scan identifier.
        </p>
        {show ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            <label className="field">
              Type DELETE to confirm
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <div className="actions">
              <Button disabled={busy || confirm !== "DELETE"}>
                Permanently delete account
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setShow(false);
                  setConfirm("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button variant="outline" onClick={() => setShow(true)}>
              Delete account
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
