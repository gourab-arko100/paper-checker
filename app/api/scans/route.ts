import { removeScans } from "@/lib/workspace";
import { z } from "zod";
import { databaseConfigured, sameOrigin, session } from "@/lib/auth";
const input = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Request origin rejected." },
      { status: 403 },
    );
  const user = await session();
  if (!user)
    return Response.json(
      { error: "Sign in to delete scans." },
      { status: 401 },
    );
  if (!databaseConfigured())
    return Response.json(
      { error: "The workspace database is unavailable." },
      { status: 503 },
    );
  const decoded = input.safeParse(await request.json().catch(() => null));
  if (!decoded.success)
    return Response.json(
      { error: "Select the scans to delete." },
      { status: 400 },
    );
  try {
    return Response.json(
      await removeScans(
        user.id,
        "ids" in decoded.data ? decoded.data.ids : undefined,
      ),
    );
  } catch {
    return Response.json({ error: "Scan deletion failed." }, { status: 503 });
  }
}
