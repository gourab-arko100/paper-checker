import { removeWorkspace } from "@/lib/workspace";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { databaseConfigured, sameOrigin, session } from "@/lib/auth";
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Request origin rejected." },
      { status: 403 },
    );
  const user = await session();
  if (!user)
    return Response.json(
      { error: "Sign in to delete your account." },
      { status: 401 },
    );
  if (!databaseConfigured())
    return Response.json(
      { error: "The workspace database is unavailable." },
      { status: 503 },
    );
  if ((await request.json().catch(() => null))?.confirmation !== "DELETE")
    return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });
  const state = await auth();
  if (
    state.factorVerificationAge?.[0] === undefined ||
    state.factorVerificationAge[0] < 0 ||
    state.factorVerificationAge[0] > 10
  )
    return Response.json(
      { error: "Sign out and sign in again to confirm this deletion." },
      { status: 403 },
    );
  try {
    await removeWorkspace(user.id);
  } catch {
    return Response.json(
      { error: "Your data could not be deleted." },
      { status: 503 },
    );
  }
  try {
    await (await clerkClient()).users.deleteUser(user.id);
  } catch {
    return Response.json(
      {
        error:
          "Workspace data was deleted. Account deletion could not be confirmed. Try again if you are still signed in.",
      },
      { status: 503 },
    );
  }
  return Response.json({ ok: true });
}
