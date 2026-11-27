import { retainsText } from "@/lib/workspace";
import { databaseConfigured, requireUser } from "@/lib/auth";
import { NewAnalysis } from "@/components/analyze";
export default async function Page() {
  const user = await requireUser("/analyze");
  if (!databaseConfigured())
    return (
      <div className="card">
        <h1>Workspace setup required</h1>
        <p>Configure the database to start document analysis.</p>
      </div>
    );
  return <NewAnalysis retains={await retainsText(user.id)} />;
}
