import Link from "next/link";
import { Header, Footer } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="container info">
        <h1>Page unavailable</h1>
        <p className="lede">
          The page may have moved or be unavailable to your account.
        </p>
        <Button asChild>
          <Link href="/">Back to Paper Checker</Link>
        </Button>
      </main>
      <Footer />
    </>
  );
}
