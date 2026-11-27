import { setRetention } from "@/lib/workspace";
import { z } from "zod";
import {
  databaseConfigured,
  ensureUser,
  sameOrigin,
  session,
} from "@/lib/auth";
export async function PATCH(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Request origin rejected." },
      { status: 403 },
    );
  const user = await session();
  if (!user)
    return Response.json(
      { error: "Sign in to change settings." },
      { status: 401 },
    );
  if (!databaseConfigured())
    return Response.json(
      { error: "The workspace database is unavailable." },
      { status: 503 },
    );
  const parsed = z
    .object({ retain: z.boolean() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Invalid retention setting." },
      { status: 400 },
    );
  try {
    await ensureUser(user.id);
    await setRetention(user.id, parsed.data.retain);
    return Response.json({ retain: parsed.data.retain });
  } catch {
    return Response.json(
      { error: "Retention settings could not be saved." },
      { status: 503 },
    );
  }
}
