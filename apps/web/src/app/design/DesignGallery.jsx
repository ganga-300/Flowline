"use client";

import { useState } from "react";
import { ArrowRight, Plus, Workflow } from "lucide-react";
import { AppIcon } from "@/components/icons/AppIcon";
import { AppShell, PageHeader } from "@/components/layout";
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, EmptyState,
  Field, Input, Modal, Select, Switch, Tabs, Textarea,
} from "@/components/ui";

function Section({ title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

export function DesignGallery() {
  const [tab, setTab] = useState("setup");
  const [enabled, setEnabled] = useState(true);
  const [modal, setModal] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="Design preview"
        description="Every shared component in the light theme. Development only."
        actions={<Button leftIcon={<Plus className="size-4" />}>New Zap</Button>}
      />

      <div className="space-y-12">
        <Section title="Hero (marketing pages)">
          <div className="bg-sky overflow-hidden rounded-card border border-line px-6 py-16 text-center">
            <Badge tone="neutral" className="bg-surface shadow-card">GitHub · Slack · Gmail</Badge>
            <h1 className="heading-display mx-auto mt-6 max-w-3xl text-5xl text-ink sm:text-6xl">
              Automate the busywork between your apps.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-ink-muted">
              When something happens in GitHub, Slack or Gmail, Flowline does the next step for you.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button size="lg" rightIcon={<ArrowRight className="size-4" />}>Get started</Button>
              <Button size="lg" variant="secondary">See how it works</Button>
            </div>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button loading>Saving</Button>
            <Button size="sm" variant="outline">Small</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Form controls">
          <Card>
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field label="Zap name" htmlFor="n" required hint="Shown on your dashboard.">
                <Input id="n" placeholder="New issue to Slack" />
              </Field>
              <Field label="Channel" htmlFor="c">
                <Select id="c" placeholder="Select a channel" options={[{ value: "C1", label: "#general" }, { value: "C2", label: "#alerts" }]} />
              </Field>
              <Field label="Message" htmlFor="m" className="sm:col-span-2">
                <Textarea id="m" placeholder="New issue: {{trigger.issue.title}}" />
              </Field>
              <Field label="Repository" htmlFor="r" error="Repository not found, or the connected account has no access.">
                <Input id="r" invalid defaultValue="octo/missing" />
              </Field>
              <Field label="Enabled">
                <div className="flex h-10 items-center gap-3">
                  <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
                  <span className="text-sm text-ink-muted">{enabled ? "On" : "Off"}</span>
                </div>
              </Field>
            </CardBody>
          </Card>
        </Section>

        <Section title="Badges (run status)">
          <div className="flex flex-wrap gap-2">
            <Badge tone="success" dot>Succeeded</Badge>
            <Badge tone="danger" dot>Failed</Badge>
            <Badge tone="primary" dot>Running</Badge>
            <Badge tone="neutral" dot>Queued</Badge>
            <Badge tone="warning" dot>Filtered</Badge>
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs value={tab} onChange={setTab} items={[{ id: "setup", label: "Setup" }, { id: "test", label: "Test" }]} />
        </Section>

        <Section title="Alerts">
          <div className="space-y-3">
            <Alert tone="success" title="Slack connected">Your workspace &ldquo;open-Source&rdquo; is ready to use.</Alert>
            <Alert tone="info">Flowline checks for new issues every few minutes.</Alert>
            <Alert tone="warning" title="Outcome unknown">This step was interrupted mid-request and was not re-sent.</Alert>
            <Alert tone="danger" title="Connection failed" onDismiss={() => {}}>bad_client_secret</Alert>
          </div>
        </Section>

        <Section title="Cards">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { app: "github", name: "New issue → Slack", desc: "GitHub · octo/demo", tone: "success", status: "On" },
              { app: "gmail", name: "Email → GitHub issue", desc: "Gmail · subject:flowline", tone: "success", status: "On" },
              { app: "slack", name: "Slack → Email", desc: "Slack · #general", tone: "neutral", status: "Off" },
            ].map(({ app, name, desc, tone, status }) => (
              <Card key={name} interactive>
                <CardBody>
                  <div className="flex items-start justify-between">
                    <AppIcon app={app} />
                    <Badge tone={tone} dot>{status}</Badge>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-ink">{name}</h3>
                  <p className="mt-0.5 text-sm text-ink-muted">{desc}</p>
                </CardBody>
                <CardFooter className="justify-between">
                  <span className="text-xs text-ink-faint">Last run 2 min ago</span>
                  <Button size="sm" variant="ghost">Edit</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title="Card with header" description="Used for settings and run details." action={<Button size="sm" variant="outline" onClick={() => setModal(true)}>Open modal</Button>} />
            <CardBody className="text-sm text-ink-muted">Body content.</CardBody>
          </Card>
        </Section>

        <Section title="Empty state">
          <EmptyState
            icon={<Workflow className="size-5" />}
            title="No Zaps yet"
            description="Create your first automation: pick a trigger, then the action Flowline should take."
            action={<Button leftIcon={<Plus className="size-4" />}>Create a Zap</Button>}
          />
        </Section>

        <Section title="Type">
          <div className="space-y-2">
            <p className="heading-display text-4xl">Display serif for big headlines</p>
            <p className="text-2xl font-semibold tracking-tight">Page title (Inter semibold)</p>
            <p className="text-sm text-ink">Body text in Inter.</p>
            <p className="text-sm text-ink-muted">Secondary text.</p>
            <code className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[13px]">{"{{trigger.issue.title}}"}</code>
          </div>
        </Section>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Delete this Zap?"
        description="Its run history is deleted too. This can't be undone."
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button variant="danger">Delete</Button></>}
      />
    </AppShell>
  );
}
