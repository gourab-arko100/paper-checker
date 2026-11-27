import Link from "next/link";
import { ShieldCheck } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-icon">
        <ShieldCheck size={22} />
      </span>
      Paper&nbsp;<span>Checker</span>
    </Link>
  );
}
