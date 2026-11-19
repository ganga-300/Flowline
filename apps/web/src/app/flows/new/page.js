"use client";

import { ZapBuilder } from "@/features/zap-builder/ZapBuilder";

// Also served at /zaps/[id]/edit (that route re-exports this page).
export default function NewZapPage() {
  return <ZapBuilder />;
}
