import { removeWorkspace } from "@/lib/workspace";
import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { databaseConfigured } from "@/lib/auth";
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET || !databaseConfigured())
    return new Response(null, { status: 503 });
  const event = await verifyWebhook(request).catch(() => null);
  if (!event) return new Response(null, { status: 400 });
  if (event.type === "user.deleted" && event.data.id) {
    try {
      await removeWorkspace(event.data.id);
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  return new Response(null, { status: 204 });
}
