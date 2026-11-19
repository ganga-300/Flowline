import Link from "next/link";
import { Logo } from "@/components/layout";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata = {
  title: "Privacy policy",
  description: "What Flowline stores, why, who else is involved, and how to delete it.",
};

const UPDATED = "19 November 2026";
// Placeholder support address: change it here (and in the Terms page) before launch.
const CONTACT = "support@flowline.app";

const SECTIONS = [
  {
    title: "Summary",
    body: [
      "Flowline connects GitHub, Gmail and Slack (plus webhooks and built-in steps) so that something happening in one app can do something in another. To do that we have to store some of your data. We keep only what Flowline needs to run your Flows and show you what they did, we don't sell it, and you can delete it yourself at any time.",
    ],
  },
  {
    title: "What we store",
    list: [
      "Your account: your email address and a hashed password. We never store the password itself.",
      "Connected accounts: the access tokens GitHub, Google and Slack give Flowline when you connect them, plus the account name or email the provider returns so you can tell accounts apart. Tokens are encrypted in our database with AES-256-GCM.",
      "Your Flows: their names, triggers, steps and settings.",
      "Run history: for each run, the trigger data that started it and the input and output of every step. For a Gmail trigger this includes the email's sender, recipients, subject, date and text; for Slack, the message text and author; for GitHub, the issue, pull request or commit details.",
      "Alerts about failed runs and connections that need attention.",
    ],
  },
  {
    title: "Why we store it",
    list: [
      "Your email and password let you sign in, reset your password and receive alerts about your Flows.",
      "Access tokens let Flowline watch for your triggers and perform your steps on your behalf.",
      "Flow definitions and run history let Flowline run your automations, retry failed runs, and show you what happened and why.",
      "We don't sell your data, share it with advertisers, or use it to train AI models.",
    ],
  },
  {
    title: "Gmail and other Google data",
    body: [
      "Flowline's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
      "In practice: Gmail read access is used only to notice new emails that match a Flow's trigger, and send access only to send the emails your Flows are set up to send. Gmail data is used only to provide the automations you configure. It isn't transferred to anyone else except as needed to run those automations (for example, to the app a step sends it to), to comply with the law, or as part of a merger or sale with your notice. People don't read it unless you ask us to (for example, to help with a support request), it's needed for security or to comply with the law, or it has been aggregated and anonymised for internal operations. It is never used for advertising.",
    ],
  },
  {
    title: "Who else is involved",
    list: [
      "GitHub, Google and Slack: Flowline calls their APIs with the access you granted, to read the events your triggers watch for and to perform your steps.",
      "Hosting providers: Render (API and background worker), Vercel (website), Neon (database) and Render Key Value (job queue) store and process data on our behalf.",
      "OpenRouter: only when a Flow uses an AI step. The prompt you write, including any data you insert into it, is sent to OpenRouter to generate the response. Flows without an AI step never send anything to OpenRouter.",
      "An email provider, to deliver password-reset emails and alert emails to your address.",
      "Webhooks and HTTP steps send data to the URLs you enter. What those services do with it is up to them.",
    ],
  },
  {
    title: "Deleting your data",
    list: [
      "Delete your account: go to Settings and choose Delete account. This permanently deletes your account, Flows, run history, alerts and stored tokens. It can't be undone.",
      "Delete a Flow: this deletes its run history and alerts.",
      "Disconnect an app on the Apps page: its stored tokens are deleted from Flowline.",
    ],
  },
  {
    title: "Revoking access at each provider",
    body: ["Deleting your Flowline account or disconnecting an app removes the tokens from Flowline. You can also cut off access from the provider's side:"],
    list: [
      "GitHub: Settings, then Applications, then Authorized OAuth Apps. Find Flowline and choose Revoke.",
      "Google: myaccount.google.com/connections (Third-party apps and services). Find Flowline and remove its access.",
      "Slack: in your workspace, open Tools and settings, then Manage apps. Find Flowline and remove it. A workspace admin may need to do this.",
    ],
  },
  {
    title: "Changes to this policy",
    body: ["If we change this policy, we'll update the date at the top of this page. If a change significantly affects how your data is used, we'll also let you know by email."],
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
              Questions about your data, or anything in this policy:{" "}
              <a href={`mailto:${CONTACT}`} className="font-medium text-ink underline underline-offset-2">{CONTACT}</a>.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
