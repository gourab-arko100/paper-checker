import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { withOwner } from "./db";
import { users } from "./schema";
import { redirect, notFound } from "next/navigation";

export const clerkConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
  );
export const databaseConfigured = () =>
  Boolean(process.env.DATABASE_URL?.trim());
export const isAdmin = (id: string) =>
  Boolean(
    id &&
      process.env.ADMIN_USER_IDS?.split(",").some(
        (value) => value.trim() === id,
      ),
  );

export async function session() {
  if (!clerkConfigured()) return null;
  const state = await auth();
  if (!state.userId) return null;
  return { id: state.userId };
}
export async function requireUser(path: string) {
  const user = await session();
  if (!user) redirect("/sign-in?redirect_url=" + encodeURIComponent(path));
  return user;
}
export async function requireAdmin(path: string) {
  const user = await requireUser(path);
  if (!isAdmin(user.id)) notFound();
  return user;
}
export async function ensureUser(id: string) {
  const [existing] = await withOwner(id, (db) =>
    db
      .select({ id: users.clerk_user_id })
      .from(users)
      .where(eq(users.clerk_user_id, id)),
  );
  if (existing) return;
  const profile = await currentUser();
  if (profile?.id !== id)
    throw new Error("The workspace identity is unavailable.");
  await withOwner(id, (db) =>
    db
      .insert(users)
      .values({
        clerk_user_id: id,
        email: profile.primaryEmailAddress?.emailAddress,
        display_name: profile.fullName,
      })
      .onConflictDoNothing(),
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return (
    origin === new URL(request.url).origin ||
    Boolean(configured && origin === new URL(configured).origin)
  );
}
