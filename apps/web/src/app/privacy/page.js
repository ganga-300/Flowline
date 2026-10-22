import Link from "next/link";
import { Logo } from "@/components/layout";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata = {
  title: "Privacy policy · Flowline",
  description: "What Flowline stores, why, and how to remove it.",
};

const UPDATED = "October 22, 2026";
// Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel to show a contact address.
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

const SECTIONS = [
  {
    title: "What Flowline is",
    body: [
      "Flowline is a personal portfolio project: a small automation tool that connects GitHub, Slack and Gmail. When something happens in one app (a new issue, message or email), it can do something in another (post a message, send an email, create an issue).",
    ],
  },
  {
    title: "What we store",
    list: [
      "Your Flowline account: email address and a hashed password (the password itself is never stored).",
      "Connected accounts: the access tokens GitHub, Slack and Google give Flowline when you connect them, plus the account's name or email where the app provides it, so you can tell them apart. Tokens are encrypted in the database (AES-256-GCM).",
      "Your Zaps: their triggers, steps and settings.",
      "Run history: for each run, the data that started it and what each step sent and received. For a Gmail trigger this includes the email's sender, recipients, subject, date and text; for Slack, the message text and author; for GitHub, the issue or commit details.",
      "Failure alerts about your runs.",
    ],
  },
  {
    title: "How the data is used",
    list: [
      "Only to run the automations you set up and to show you their history.",
      "Gmail: read access is used to notice new emails that match your Zap's trigger; send access is used only to send the emails your Zaps are configured to send.",
      "Slack and GitHub access is used the same way: to read new events for your triggers and to perform the actions in your steps.",
      "No data is sold, shared with advertisers, or used to train AI models. If you add an AI step, the prompt you write (with any data you insert into it) is sent to OpenRouter to generate the response.",
    ],
  },
  {
    title: "Google user data",
    body: [
      "Flowline's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Gmail data is used only to provide the automations you configure, is not transferred to others except as needed for those automations, and is not read by people except with your permission or where required by law.",
    ],
  },
  {
    title: "Where data is kept",
    body: [
      "Flowline runs on Render (API and background worker), Vercel (website), Neon (database) and Render Key Value (job queue). These providers host the data on Flowline's behalf.",
    ],
  },
  {
    title: "Removing your data",
    list: [
      "Disconnect an app on the Connections page: its stored tokens are deleted from Flowline. You can also revoke access in the app itself (GitHub, Slack or Google account settings).",
      "Deleting a Zap deletes its run history and alerts.",
      "To delete your whole Flowline account and everything in it, contact us (below).",
    ],
  },
  {
    title: "Changes",
    body: ["If this policy changes, the date at the top of this page is updated."],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Logo href="/" />
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">Back to home</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="heading-display text-4xl text-ink sm:text-5xl">Privacy policy</h1>
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
              {CONTACT ? (
                <>Questions or deletion requests: <a href={`mailto:${CONTACT}`} className="font-medium text-ink underline underline-offset-2">{CONTACT}</a>.</>
              ) : (
                "Questions or deletion requests: contact the developer through the Flowline project's GitHub repository."
              )}
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
