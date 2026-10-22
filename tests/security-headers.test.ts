import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

describe("security headers", () => {
  it("forbids framing, plugins and foreign base URIs", () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it("only lets images come from the app and TMDB", () => {
    expect(contentSecurityPolicy(false)).toContain("img-src 'self' data: https://image.tmdb.org;");
  });

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
  });

  it("sends the companion headers", () => {
    const names = securityHeaders(false).map((header) => header.key);
    expect(names).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "X-Frame-Options",
        "Permissions-Policy",
      ]),
    );
  });
});
