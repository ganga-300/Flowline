"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useAuthProtection() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("flowline_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    // localStorage only exists in the browser, so this is known after the first render.
    let alive = true;
    queueMicrotask(() => alive && setIsAuthenticated(true));
    return () => {
      alive = false;
    };
  }, [router]);

  return { isAuthenticated };
}
