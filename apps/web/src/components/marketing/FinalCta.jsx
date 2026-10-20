import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { ScenicBackground } from "./ScenicBackground";

export function FinalCta() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-line">
        <ScenicBackground />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-white/0 to-white/30" />
        <div className="relative px-6 py-24 text-center sm:py-32">
          <h2 className="heading-display mx-auto max-w-2xl text-4xl text-ink sm:text-6xl">Let the next step take care of itself.</h2>
          <p className="mx-auto mt-4 max-w-md text-base text-ink-muted">Connect your apps and build your first Zap in a few minutes.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button href="/signup" size="lg" rightIcon={<ArrowRight className="size-4" />}>Create your account</Button>
            <Button href="/login" size="lg" variant="outline" className="bg-white/70">Log in</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
