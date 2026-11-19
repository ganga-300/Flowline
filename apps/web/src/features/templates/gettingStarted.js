// The dashboard's getting-started checklist, ticked from real data. No React here.

/** True once any Flow has run at least once (the zap list items carry `lastRun`). */
export function hasAnyRun(zaps = []) {
  return zaps.some((z) => Boolean(z?.lastRun));
}

/**
 * The three getting-started items. connections: the list from GET /connections, or
 * null/undefined when it couldn't be loaded (then "Connect an app" stays unticked).
 */
export function gettingStartedItems({ connections, zaps = [] }) {
  return [
    {
      id: "connect",
      title: "Connect an app",
      description: "Sign in to GitHub, Gmail or Slack so Flowline can act for you. Webhooks need no account.",
      href: "/connections",
      cta: "Connect an app",
      done: Array.isArray(connections) && connections.length > 0,
    },
    {
      id: "create",
      title: "Create your first Flow",
      description: "Pick what starts it and what happens next, or start from a template below.",
      href: "/flows/new",
      cta: "Create a Flow",
      done: zaps.length > 0,
    },
    {
      id: "run",
      title: "See it run",
      description: "Make the trigger happen, or press Run on a Flow, then check what each step did.",
      href: null,
      cta: null,
      done: hasAnyRun(zaps),
    },
  ];
}
