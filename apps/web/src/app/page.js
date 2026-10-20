import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { ScenicBackground } from "@/components/marketing/ScenicBackground";
import { HeroPreview } from "@/components/marketing/HeroPreview";
import { Integrations } from "@/components/marketing/Integrations";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { ExampleWorkflows } from "@/components/marketing/ExampleWorkflows";
import { Reliability } from "@/components/marketing/Reliability";
import { FinalCta } from "@/components/marketing/FinalCta";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { RedirectIfSignedIn } from "@/components/marketing/RedirectIfSignedIn";

export const metadata = {
  title: "Flowline - Automate the busywork between GitHub, Slack and Gmail",
  description: "When something happens in GitHub, Slack or Gmail, Flowline does the next step for you. Build automations in minutes and see every run.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <RedirectIfSignedIn />
      <MarketingNav />

      <main>
        {/* Hero: headline in the sky, product card rising from the meadow */}
        <section className="relative overflow-hidden">
          {/* The scene fades into the page via a mask, so there's no seam at the bottom. */}
          <ScenicBackground className="[mask-image:linear-gradient(to_bottom,black_72%,transparent)]" />
          <div className="relative mx-auto max-w-6xl px-5 pt-36 text-center sm:px-8 sm:pt-44">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-ink shadow-card ring-1 ring-white/80 backdrop-blur">
              <span className="size-1.5 rounded-full bg-success" />
              GitHub · Slack · Gmail
            </span>
            <h1 className="heading-display mx-auto mt-7 max-w-4xl text-[44px] text-ink sm:text-7xl lg:text-[88px]">
              Automate the busywork between your apps.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              When something happens in GitHub, Slack or Gmail, Flowline does the next step for you, and shows you every run.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href="/signup" size="lg" rightIcon={<ArrowRight className="size-4" />}>Get started</Button>
              <Button href="#how-it-works" size="lg" variant="outline" className="bg-white/70 backdrop-blur">See how it works</Button>
            </div>
          </div>
          <div className="relative mx-auto mt-16 max-w-5xl px-4 pb-24 sm:mt-20 sm:px-8 sm:pb-32">
            <HeroPreview />
          </div>
        </section>

        <HowItWorks />
        <Integrations />
        <ExampleWorkflows />
        <Reliability />
        <FinalCta />
      </main>

      <MarketingFooter />
    </div>
  );
}
