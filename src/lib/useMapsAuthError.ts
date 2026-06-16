"use client";

import { useEffect, useState } from "react";

// Google Maps calls window.gm_authFailure() on an auth error (bad key, domain
// not in the referrer allowlist, etc.). We surface that so the game can show a
// clear error instead of running over a blank/broken map.
export function useMapsAuthError(): boolean {
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = () => setAuthFailed(true);
    return () => {
      w.gm_authFailure = undefined;
    };
  }, []);

  return authFailed;
}
