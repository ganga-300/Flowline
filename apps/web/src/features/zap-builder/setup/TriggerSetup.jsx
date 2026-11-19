"use client";

import { Info } from "lucide-react";
import { Field, Input, Select } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";
import { triggerProviders } from "@/integrations/triggers";
import { ConnectionSelector } from "@/integrations/ConnectionSelector";
import { GitHubRepoSelector } from "@/integrations/GitHubRepoSelector";
import { getPlaceholderSample, withRepository } from "@/integrations/triggerVariables";
import { getTriggerProviderOrDefault } from "../stepTypes";
import { SlackChannelSelect } from "./SlackChannelSelect";
import { WebhookUrl } from "./WebhookUrl";

const HOW_IT_WORKS = {
  webhook: "Every POST request to this Zap's URL starts a run, with the request body as the trigger data.",
  gmail: "Flowline checks your inbox about every 5 minutes. Each new email that matches the search starts a run with the sender, subject and body.",
  slack: "Flowline checks the channel about every 5 minutes. Each new message starts a run with the text, the author and the channel.",
  github: "Flowline checks the repository about every 5 minutes. Each new issue or push starts a run with its details.",
};

/** Setup tab for the trigger: app, event, account and app-specific options. */
export function TriggerSetup({ draft, updateDraft, setSampleData }) {
  const config = draft.config || {};
  // A new Zap starts with no app picked, so nothing is chosen for the user.
  const provider = config.provider ? getTriggerProviderOrDefault(config.provider) : null;
  const connectionId = config.connectionId || draft.connectionId || null;

  const chooseProvider = (p) => {
    const first = p.events[0];
    setSampleData(getPlaceholderSample(p.id, first.id, config.repo));
    updateDraft({ type: first.type, config: { ...config, provider: p.id, event: first.id } });
  };

  const chooseEvent = (eventId) => {
    const evt = provider.events.find((e) => e.id === eventId) || provider.events[0];
    setSampleData(getPlaceholderSample(provider.id, evt.id, config.repo));
    updateDraft({ type: evt.type, config: { ...config, event: evt.id } });
  };

  const setConnection = (connId) => updateDraft({ connectionId: connId, config: { ...config, connectionId: connId } });
  const setConfig = (patch) => updateDraft({ config: { ...config, ...patch } });

  return (
    <div className="space-y-5">
      <div id="stage-app" className="scroll-mt-4 space-y-1.5">
        <p className="text-sm font-medium text-ink">App</p>
        <div className="grid grid-cols-2 gap-2">
          {triggerProviders.map((p) => {
            const selected = p.id === provider?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => !selected && chooseProvider(p)}
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-left text-sm font-medium transition cursor-pointer",
                  selected ? "border-primary bg-primary-soft text-ink ring-2 ring-primary/15" : "border-line bg-surface text-ink hover:border-line-strong"
                )}
              >
                <AppIcon app={p.id} size="sm" />
                {p.name}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-muted">{provider ? provider.description : "Pick the app whose events start this Zap."}</p>
      </div>

      {provider && (
        <Field label="Event">
          <Select value={config.event || provider.events[0].id} onChange={(e) => chooseEvent(e.target.value)}>
            {provider.events.map((evt) => <option key={evt.id} value={evt.id}>{evt.name}</option>)}
          </Select>
        </Field>
      )}

      {provider?.id === "webhook" && <WebhookUrl token={draft.webhookToken} />}

      {["github", "gmail", "slack"].includes(provider?.id) && (
        <div id="stage-account" className="scroll-mt-4">
          <ConnectionSelector providerId={provider.id} providerName={provider.name} connectionId={connectionId} onChange={setConnection} />
        </div>
      )}

      {provider?.id === "github" && (
        <div id="stage-configure" className="scroll-mt-4">
        <GitHubRepoSelector
          connectionId={connectionId}
          value={config.repo || ""}
          onChange={(repo) => setConfig({ repo })}
          onSampleDataChange={(repo) => setSampleData((prev) => withRepository(prev, repo))}
        />
        </div>
      )}

      {provider?.id === "gmail" && (
        <Field label="Only emails matching (optional)" hint="Any Gmail search, e.g. from:boss@company.com subject:invoice. Leave empty for every new email. Avoid is:unread: Flowline checks every 5 minutes, so emails you open before then would be skipped.">
          <Input value={config.query || ""} onChange={(e) => setConfig({ query: e.target.value })} placeholder="from:boss@company.com" className="font-mono text-[13px]" />
        </Field>
      )}

      {provider?.id === "slack" && (
        <div id="stage-configure" className="scroll-mt-4">
          <SlackChannelSelect connectionId={connectionId} value={config.channel || ""} onChange={(channel) => setConfig({ channel })} />
        </div>
      )}

      {provider && (
        <div className="flex gap-2.5 rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          <p>{HOW_IT_WORKS[provider.id]}</p>
        </div>
      )}
    </div>
  );
}
