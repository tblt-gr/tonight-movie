import { NextResponse, type NextRequest } from "next/server";
import { decideRouting } from "@/lib/i18n/routing";

export function proxy(request: NextRequest) {
  const decision = decideRouting(request.nextUrl.pathname);
  if (!decision) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = decision.to;
  return decision.action === "redirect"
    ? NextResponse.redirect(url, 308)
    : NextResponse.rewrite(url);
}

export const config = {
  // Pages only: API routes, build output and every file with an extension are left alone.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
