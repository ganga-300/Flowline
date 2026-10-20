"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The landing page is for visitors; signed-in users go straight to their dashboard. */
export function RedirectIfSignedIn({ to = "/dashboard" }) {
  const router = useRouter();
  useEffect(() => {
    try {
      if (localStorage.getItem("flowline_token")) router.replace(to);
    } catch {
      // storage unavailable: stay on the landing page
    }
  }, [router, to]);
  return null;
}
