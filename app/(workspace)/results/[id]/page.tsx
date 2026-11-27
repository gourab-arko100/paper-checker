import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { SavedReport } from "@/components/analyze";
import { report } from "@/lib/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser("/results/" + id);
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await report(user.id, id);
  if (!result) notFound();
  return <SavedReport scan={result.scan} text={result.text} />;
}
