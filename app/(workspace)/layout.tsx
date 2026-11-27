import { session, isAdmin } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import {
  LayoutDashboard,
  FilePlus2,
  History,
  GitCompareArrows,
  Settings,
  ShieldCheck,
} from "lucide-react";
export const dynamic = "force-dynamic";
const links = [
  ["Dashboard", "dashboard", LayoutDashboard],
  ["New analysis", "analyze", FilePlus2],
  ["Scan history", "history", History],
  ["Compare documents", "compare", GitCompareArrows],
  ["Settings", "settings", Settings],
] as const;
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await session();
  if (!user) return children;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Workspace">
          {links.map(([label, path, Icon]) => (
            <Link key={path} href={"/" + path}>
              <Icon size={18} />
              {label}
            </Link>
          ))}
          {isAdmin(user.id) && (
            <Link href="/admin">
              <ShieldCheck size={18} />
              Administration
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          <ThemeToggle />
          <UserButton />
        </div>
      </aside>
      <main className="workspace-main">{children}</main>
    </div>
  );
}
