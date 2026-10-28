import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/chat/server/embed-headers";

function ancestorOrigin(request: NextRequest): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const policy = contentSecurityPolicy(request.nextUrl.pathname, process.env.CHAT_ALLOWED_ORIGINS, ancestorOrigin(request));
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|embed\\.js).*)"],
};
