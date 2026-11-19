import Link from "next/link";
import { Logo } from "@/components/layout";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata = {
  title: "Terms of service",
  description: "The rules for using Flowline, and what you can expect from us.",
};

const UPDATED = "19 November 2026";
// Placeholder support address: change it here (and in the Privacy page) before launch.
const CONTACT = "support@flowline.app";

const SECTIONS = [
  {
    title: "The short version",
    body: [
      "Flowline lets you build Flows: automations that connect GitHub, Gmail, Slack, webhooks and built-in steps. By creating an account or using Flowline, you agree to these terms. If you don't agree, please don't use Flowline.",
    ],
  },
  {
    title: "Your account",
    list: [
      "Use a real email address you can access, and keep your password to yourself. You're responsible for activity on your account.",
      "Only connect GitHub, Google and Slack accounts that you own or are allowed to use, and follow those services' own terms when Flowline acts on your behalf.",
    ],
  },
  {
    title: "Acceptable use",
    body: ["Don't use Flowline to:"],
    list: [
      "Send spam, bulk unsolicited messages or emails, or anything recipients haven't agreed to receive.",
      "Abuse connected accounts: flooding channels, repositories or inboxes, getting around a provider's rate limits, or using someone else's account without permission.",
      "Harass people, or send content that is illegal, deceptive or malicious (including malware and phishing).",
      "Interfere with Flowline itself: probing for vulnerabilities without permission, overloading the service, or trying to access other users' data.",
    ],
  },
  {
    title: "You're responsible for your Flows",
    body: [
      "Flowline does what your Flows tell it to do. You're responsible for what they send, post, create or change, and for checking that a Flow works as you expect before relying on it. Test new Flows on data you can afford to get wrong.",
    ],
  },
  {
    title: "The service is provided as-is",
    body: [
      "Flowline is provided \"as is\" and \"as available\", without warranties of any kind. We don't guarantee any level of uptime, that every trigger will be noticed, or that every run will succeed or run on time. GitHub, Google, Slack and other services can change or fail in ways outside our control.",
      "To the extent the law allows, Flowline isn't liable for indirect or consequential losses, or for lost data, messages or profits, arising from your use of the service.",
    ],
  },
  {
    title: "Suspending accounts",
    body: [
      "We may pause Flows or suspend or close an account that breaks these terms, is being used to abuse other people or services, or puts Flowline or its users at risk. Where we reasonably can, we'll tell you why by email.",
    ],
  },
  {
    title: "Deleting your account",
    body: [
      "You can delete your account at any time in Settings. This permanently deletes your account, Flows, run history, alerts and stored tokens, and can't be undone. Our Privacy policy explains what we store and how to revoke Flowline's access at each provider.",
    ],
  },
  {
    title: "Changes to these terms",
    body: [
      "We may update these terms. When we do, we'll change the date at the top of this page, and we'll let you know by email if a change is significant. If you keep using Flowline after a change, you accept the updated terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Logo href="/" />
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">Back to home</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="heading-display text-4xl text-ink sm:text-5xl">Terms of service</h1>
        <p className="mt-3 text-sm text-ink-muted">Last updated {UPDATED}</p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold text-ink">{s.title}</h2>
              {s.body?.map((p) => <p key={p} className="mt-3 leading-relaxed text-ink-muted">{p}</p>)}
              {s.list && (
                <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-muted marker:text-ink-faint">
                  {s.list.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}

          <section>
            <h2 className="text-lg font-semibold text-ink">Contact</h2>
            <p className="mt-3 leading-relaxed text-ink-muted">
              Questions about these terms:{" "}
              <a href={`mailto:${CONTACT}`} className="font-medium text-ink underline underline-offset-2">{CONTACT}</a>.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
