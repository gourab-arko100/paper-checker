import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Theme } from "@/components/theme";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Paper Checker · Academic Writing Analysis",
    template: "%s · Paper Checker",
  },
  description:
    "AI writing detection and academic feedback in one private workspace.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  const content = <Theme>{children}</Theme>;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider>{content}</ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
