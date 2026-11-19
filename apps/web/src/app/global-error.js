"use client";

import "./globals.css";

/** Last resort when the root layout itself fails: a plain page with a way to reload. */
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center font-sans">
        <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
        <p className="max-w-md text-sm text-ink-muted">Flowline couldn&apos;t load this page. Your Flows keep running in the background.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
