import Link from "next/link";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme";
import { Button } from "./ui/button";
const links = [
  ["Features", "features"],
  ["How it works", "how-it-works"],
  ["Methodology", "methodology"],
  ["FAQ", "faq"],
];
export function Header() {
  return (
    <header className="public-header">
      <div className="container nav">
        <Brand />
        <nav aria-label="Main navigation">
          {links.map(([label, path]) => (
            <Link key={path} href={"/#" + path}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <Link className="sign-in-link" href="/sign-in">
            Sign in
          </Link>
          <Button asChild>
            <Link href="/analyze">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="public-footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Brand />
            <p>Academic writing analysis and AI detection.</p>
          </div>
          <nav aria-label="Footer navigation">
            {[
              ...links.map(([label, path]) => [label, "#" + path]),
              ["About", "about"],
              ["Privacy", "privacy"],
              ["Terms", "terms"],
            ].map(([label, path]) => (
              <Link key={path} href={"/" + path}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="footer-bottom">
          © {new Date().getFullYear()} Paper Checker
        </div>
      </div>
    </footer>
  );
}
