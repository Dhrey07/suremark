import { NextResponse, type NextRequest } from "next/server";

const DEVICE_COOKIE = "upa_did";

/** Gives each browser an anonymous device id (hashed server-side) used only for scan-pattern risk signals. */
export function proxy(request: NextRequest) {
  if (request.cookies.get(DEVICE_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  // Expose the new id to this request as well, so the very first check is attributed to the device.
  const headers = new Headers(request.headers);
  headers.set("cookie", [request.headers.get("cookie"), `${DEVICE_COOKIE}=${id}`].filter(Boolean).join("; "));
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico).*)"],
};
