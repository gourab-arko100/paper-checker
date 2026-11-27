import { SignIn, SignUp } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/auth";
import { Header, Footer } from "./public-shell";
export function AuthPage({ kind }: { kind: "in" | "up" }) {
  return (
    <>
      <Header />
      <main className="auth-shell">
        {clerkConfigured() ? (
          kind === "in" ? (
            <SignIn
              path="/sign-in"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/dashboard"
            />
          ) : (
            <SignUp
              path="/sign-up"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/dashboard"
            />
          )
        ) : (
          <div className="card">
            <h2>Authentication setup required</h2>
            <p>
              Configure the Clerk environment variables to access the Paper Checker
              workspace.
            </p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
