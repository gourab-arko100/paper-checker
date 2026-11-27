import { retainsText } from "@/lib/workspace";
import { databaseConfigured, requireUser } from "@/lib/auth";
import { Settings } from "@/components/settings";
export default async function Page() {
  const user = await requireUser("/settings");
  if (!databaseConfigured())
    return (
      <div className="card">
        <h1>Workspace setup required</h1>
        <p>Configure the database to manage account settings.</p>
      </div>
    );
  return <Settings initial={await retainsText(user.id)} />;
}
