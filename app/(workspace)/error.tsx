"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div role="alert" className="card stack">
      <h1>Workspace unavailable</h1>
      <p>Paper Checker could not load this page. Try again in a moment.</p>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
