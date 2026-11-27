import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";

const protectedPage =
  /^\/(dashboard|analyze|history|compare|settings|results|admin)(\/|$)/;
function signIn(request: NextRequest) {
  const destination = new URL("/sign-in", request.url);
  destination.searchParams.set(
    "redirect_url",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(destination);
}

const clerk = clerkMiddleware(async (auth, request) => {
  if (protectedPage.test(request.nextUrl.pathname) && !(await auth()).userId)
    return signIn(request);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  )
    return clerk(request, event);
  return protectedPage.test(request.nextUrl.pathname)
    ? signIn(request)
    : NextResponse.next();
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|map)).*)",
    "/api/(.*)",
  ],
};
