import { Admin } from "@/components/admin";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ section }, { page }] = await Promise.all([params, searchParams]);
  return (
    <Admin
      section={section}
      page={Math.max(1, Math.min(10000, Number.parseInt(page ?? "1", 10) || 1))}
    />
  );
}
