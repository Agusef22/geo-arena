import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "magiclink"
    | "email"
    | "signup"
    | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();
  let authenticated = false;

  // PKCE flow — magic link redirected with a code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) authenticated = true;
  }
  // Token hash flow — fallback for email verification / magic link
  else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) authenticated = true;
  }

  if (authenticated) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!profile) {
        return NextResponse.redirect(`${origin}/profile/setup`);
      }
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
