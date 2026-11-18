"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { StatusPage } from "@/components/layout/StatusPage";

/** Shown when a page crashes while rendering, instead of a blank screen. */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="Something went wrong"
      description="This page hit an unexpected error. Your Zaps keep running; try again, or go back to your Zaps."
      actions={
        <>
          <Button variant="secondary" onClick={() => reset()}>Try again</Button>
          <Button href="/dashboard">Go to your Zaps</Button>
        </>
      }
    />
  );
}
