"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ─── Scroll-Reveal Hook ─── */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/* ─── Animated Trace Panel (loops) ─── */
const TRACE_ENTRIES = [
  {
    time: "14:20:01.2",
    label: "JOB_QUEUED / bullmq.main",
    detail: "attempt: 1 · lock: acquired",
  },
  {
    time: "14:20:02.8",
    label: "BRANCH_EVAL / is_valid_payload",
    detail: "result: true · target: delay.wait_10m",
  },
  {
    time: "14:20:02.9",
    label: "PERSISTENCE_SYNC / postgres",
    detail: "state saved · resume_at: 14:30:00",
  },
  {
    time: "14:30:00.1",
    label: "AI_TRANSFORM / openrouter",
    detail: "output schema validated · step complete",
  },
];

function AnimatedTrace() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [visibleEntries, setVisibleEntries] = useState([]);

  useEffect(() => {
    let step = 0;
    const entries = [];
    const interval = setInterval(() => {
      if (step < TRACE_ENTRIES.length) {
        entries.push(step);
        setVisibleEntries([...entries]);
        setActiveIdx(step);
        step++;
      } else {
        // Reset after a pause
        setTimeout(() => {
          setVisibleEntries([]);
          setActiveIdx(0);
          step = 0;
        }, 2000);
      }
    }, 1800);
    // Trigger first one immediately
    entries.push(0);
    setVisibleEntries([0]);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-0">
      {TRACE_ENTRIES.map((entry, i) => (
        <div
          key={i}
          className={`flex gap-4 py-3 px-4 border-l-2 transition-all duration-500 ${
            visibleEntries.includes(i)
              ? "opacity-100 translate-x-0"
              : "opacity-0 translate-x-4"
          } ${
            activeIdx === i
              ? "border-l-[var(--color-accent)]"
              : "border-l-[var(--color-border)]"
          }`}
          style={{ transitionDelay: `${i * 100}ms` }}
        >
          <span className="font-mono text-xs text-[var(--color-muted)] whitespace-nowrap min-w-[70px]">
            {entry.time}
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-sm ${
                  activeIdx === i ? "bg-[var(--color-accent)]" : "bg-[var(--color-muted)]"
                } transition-colors duration-300`}
              />
              <span className="font-mono text-xs font-semibold text-[var(--color-foreground)]">
                {entry.label}
              </span>
            </div>
            <span className="font-mono text-xs text-[var(--color-muted)] pl-4">
              {entry.detail}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Hero Pipeline Panel (matches screenshot exactly) ─── */
const PIPELINE_NODES = [
  {
    title: "Trigger",
    icon: "⚡",
    detail: "Webhook.run",
    sub: null,
    bottomLeft: null,
    bottomRight: null,
    progressBar: true,
  },
  {
    title: "Branch",
    icon: "⫦",
    detail: "is_valid?",
    sub: null,
    bottomLeft: "OK",
    bottomRight: "RETRY",
    progressBar: false,
  },
  {
    title: "Delay",
    icon: "◷",
    detail: "Wait 10m",
    sub: null,
    bottomLeft: "PSQL",
    bottomRight: "STATEDURABLE",
    progressBar: false,
  },
  {
    title: "AI transform",
    icon: "AI",
    detail: "OpenRouter",
    sub: "→ structured output",
    bottomLeft: null,
    bottomRight: null,
    progressBar: false,
  },
];

const HERO_TRACE_EVENTS = [
  { time: "14:20:01", label: "EVENT_INGESTED" },
  { time: "14:20:02", label: "BRANCH_EVAL" },
  { time: "14:20:03", label: "STATE_PERSISTED" },
  { time: "14:30:01", label: "AI_COMPLETE" },
];

function HeroPipelinePanel() {
  const [activeNode, setActiveNode] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setActiveNode((prev) => (prev + 1) % 4);
    }, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused]);

  // Which trace events are visible based on active node
  const visibleTraces = HERO_TRACE_EVENTS.slice(0, activeNode + 1);

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
          <span className="text-[var(--color-foreground)]">▣</span>
          <span className="tracking-wider">FLOWLINE / PIPELINE.RUN</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
          <span className="tracking-wider">SAMPLE EXECUTION</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span className="text-[var(--color-accent)]">READY</span>
        </div>
      </div>

      {/* Subheader */}
      <div className="px-5 py-2.5 border-b border-[var(--color-border)]">
        <span className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-muted)]">
          WORKFLOW GRAPH / SAMPLE DATA
        </span>
      </div>

      {/* Nodes Row */}
      <div className="px-5 py-6">
        <div className="flex items-stretch gap-0">
          {PIPELINE_NODES.map((node, i) => (
            <div key={i} className="flex items-center flex-1 min-w-0">
              {/* Node Card */}
              <div
                className={`flex-1 min-w-0 border rounded-md p-3 transition-all duration-500 relative ${
                  activeNode === i
                    ? "border-[var(--color-accent)] shadow-[0_0_20px_rgba(196,245,66,0.12)]"
                    : "border-[var(--color-border)]"
                }`}
              >
                {/* Node title + icon */}
                <div className="flex items-center justify-between mb-2.5">
                  <span
                    className={`font-mono text-[10px] tracking-wider transition-colors duration-500 ${
                      activeNode === i
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    {node.title}
                  </span>
                  <span
                    className={`text-[10px] font-mono transition-colors duration-500 ${
                      activeNode === i
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    {node.icon}
                  </span>
                </div>

                {/* Main detail */}
                <div
                  className={`font-mono text-xs font-semibold transition-colors duration-500 ${
                    activeNode === i
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-foreground)]"
                  }`}
                >
                  {node.detail}
                </div>

                {/* Sub text */}
                {node.sub && (
                  <div className="font-mono text-[10px] text-[var(--color-muted)] mt-1">
                    {node.sub}
                  </div>
                )}

                {/* Progress bar (Trigger only) */}
                {node.progressBar && (
                  <div className="mt-2.5 h-0.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-[2000ms] ease-linear ${
                        activeNode === i ? "bg-[var(--color-accent)]" : "bg-transparent"
                      }`}
                      style={{ width: activeNode === i ? "100%" : "0%" }}
                    />
                  </div>
                )}

                {/* Bottom labels (Branch / Delay) */}
                {(node.bottomLeft || node.bottomRight) && (
                  <div className="flex items-center justify-between mt-2.5 font-mono text-[9px] text-[var(--color-muted)]">
                    <span>{node.bottomLeft}</span>
                    <span>{node.bottomRight}</span>
                  </div>
                )}
              </div>

              {/* Connector Arrow (between nodes) */}
              {i < PIPELINE_NODES.length - 1 && (
                <div className="flex items-center px-1 shrink-0">
                  <div
                    className={`w-4 sm:w-6 h-px transition-colors duration-500 ${
                      activeNode > i
                        ? "bg-[var(--color-accent)]"
                        : "bg-[var(--color-border)]"
                    }`}
                  />
                  <div
                    className={`w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-t-transparent border-b-transparent transition-colors duration-500 ${
                      activeNode > i
                        ? "border-l-[var(--color-accent)]"
                        : "border-l-[var(--color-border)]"
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Trace Log Row */}
      <div className="px-5 py-3 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-muted)]">
            EXAMPLE TRACE / ILLUSTRATIVE
          </span>
          <span className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-muted)]">
            TRACE_ID: DEMO_88192A
          </span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          {HERO_TRACE_EVENTS.map((evt, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 transition-all duration-500 whitespace-nowrap ${
                i <= activeNode ? "opacity-100" : "opacity-20"
              }`}
            >
              <span className="font-mono text-[10px] text-[var(--color-muted)]">
                {evt.time}
              </span>
              <span
                className={`font-mono text-[10px] font-semibold transition-colors duration-500 ${
                  i === activeNode
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-foreground)]"
                }`}
              >
                {evt.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
        <span className="font-mono text-[10px] text-[var(--color-muted)]">
          Sequence: trigger → branch → delay → AI
        </span>
        <button
          onClick={() => setPaused((p) => !p)}
          className="px-3 py-1 border border-[var(--color-border)] rounded font-mono text-[10px] tracking-wider text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all duration-200"
        >
          {paused ? "RESUME DEMO" : "PAUSE DEMO"}
        </button>
      </div>
    </div>
  );
}

/* ─── Conditional Paths Diagram ─── */
function BranchDiagram() {
  return (
    <div className="relative w-full h-28 flex items-center justify-center">
      {/* Center node */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_rgba(196,245,66,0.4)]" />
      {/* Lines going out */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 300 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left line */}
        <line x1="100" y1="50" x2="150" y2="50" stroke="rgba(196,245,66,0.3)" strokeWidth="1" />
        {/* Top right */}
        <line x1="150" y1="50" x2="230" y2="20" stroke="rgba(196,245,66,0.3)" strokeWidth="1" />
        <circle cx="230" cy="20" r="3" fill="#c4f542" opacity="0.6" />
        {/* Bottom right */}
        <line x1="150" y1="50" x2="230" y2="80" stroke="rgba(196,245,66,0.3)" strokeWidth="1" />
        <circle cx="230" cy="80" r="3" fill="#c4f542" opacity="0.6" />
        {/* Left dot */}
        <circle cx="100" cy="50" r="3" fill="#c4f542" opacity="0.6" />
      </svg>
    </div>
  );
}

/* ─── Backoff Bars ─── */
function BackoffBars() {
  return (
    <div className="flex flex-col gap-3 font-mono text-xs">
      <div className="flex items-center justify-between text-[var(--color-muted)] mb-1">
        <span>attempt</span>
        <span>next run</span>
      </div>
      {[
        { num: "01", delay: "2s", width: "40%" },
        { num: "02", delay: "4s", width: "60%" },
        { num: "03", delay: "8s", width: "85%" },
      ].map((item) => (
        <div key={item.num} className="flex items-center gap-3">
          <span className="text-[var(--color-accent)] font-semibold w-5">
            {item.num}
          </span>
          <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-1000"
              style={{ width: item.width }}
            />
          </div>
          <span className="text-[var(--color-muted)] w-6 text-right">
            {item.delay}
          </span>
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-[var(--color-muted)]">
        idempotency_key: evt_42
      </div>
    </div>
  );
}

/* ─── Section Components ─── */
function SectionLabel({ children }) {
  return (
    <span className="font-mono text-xs tracking-[0.2em] uppercase text-[var(--color-muted)]">
      {children}
    </span>
  );
}

function SectionHeadingMono({ children, className = "" }) {
  return (
    <h2
      className={`font-mono font-bold text-[var(--color-foreground)] ${className}`}
    >
      {children}
    </h2>
  );
}

/* ─── Main Page ─── */
export default function Home() {
  const heroRef = useReveal();
  const engineRef = useReveal();
  const card1Ref = useReveal();
  const card2Ref = useReveal();
  const reliabilityRef = useReveal();
  const card3Ref = useReveal();
  const card4Ref = useReveal();
  const contractRef = useReveal();
  const aiRef = useReveal();
  const traceRef = useReveal();
  const ctaRef = useReveal();

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* ═══════════════ NAVBAR ═══════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-[var(--color-accent)] flex items-center justify-center">
                <span className="text-black font-mono font-bold text-xs">F</span>
              </div>
              <span className="font-mono font-bold text-sm tracking-wider text-[var(--color-foreground)]">
                FLOWLINE
              </span>
            </div>
            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-5">
              {["ENGINE", "TRACES", "DOCS"].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="font-mono text-xs tracking-wider text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors duration-200"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
          {/* Right side */}
          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-center gap-4 font-mono text-xs text-[var(--color-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                NODE
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                BULLMQ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                POSTGRES
              </span>
            </div>
            <Link
              href="/signup"
              className="px-4 py-1.5 border border-[var(--color-foreground)] rounded font-mono text-xs tracking-wider text-[var(--color-foreground)] hover:bg-[var(--color-foreground)] hover:text-[var(--color-background)] transition-all duration-200"
            >
              GET STARTED
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="pt-24 pb-20 px-6">
        <div ref={heroRef} className="reveal max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            {/* Left Column */}
            <div className="flex flex-col justify-between min-h-[420px]">
              {/* Badge */}
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30 rounded mb-8">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                  <span className="font-mono text-[10px] tracking-[0.15em] text-[var(--color-accent)] font-semibold">
                    ASYNC WORKFLOW ENGINE
                  </span>
                </div>

                {/* Headline */}
                <h1 className="font-mono font-bold text-4xl sm:text-5xl md:text-[3.4rem] leading-[1.1] mb-6">
                  Async
                  <br />
                  workflows,
                  <br />
                  <span className="text-[var(--color-accent)]">uncompromised</span>.
                </h1>

                {/* Subtext */}
                <p className="text-sm text-[var(--color-body)] max-w-sm leading-relaxed mb-8">
                  A technical core for orchestrating Node.js pipelines with
                  BullMQ durability and PostgreSQL state persistence.
                </p>

                {/* CTA buttons */}
                <div className="flex items-center gap-5 mb-10">
                  <Link
                    href="/signup"
                    className="px-6 py-2.5 bg-[var(--color-accent)] text-black font-mono text-xs tracking-wider font-semibold rounded hover:bg-[#d4ff52] hover:shadow-[0_0_30px_rgba(196,245,66,0.3)] transition-all duration-300 inline-block text-center"
                  >
                    GET STARTED
                  </Link>
                  <a
                    href="#engine"
                    className="font-mono text-xs tracking-wider text-[var(--color-foreground)] underline underline-offset-4 decoration-[var(--color-border)] hover:decoration-[var(--color-accent)] transition-all duration-200 flex items-center gap-1"
                  >
                    See how it works →
                  </a>
                </div>
              </div>

              {/* Bottom Labels */}
              <div className="flex items-center gap-6 font-mono text-[10px] tracking-[0.15em] text-[var(--color-muted)]">
                <span>WEBHOOKS</span>
                <span className="w-1 h-1 rounded-full bg-[var(--color-border)]" />
                <span>DURABLE STATE</span>
                <span className="w-1 h-1 rounded-full bg-[var(--color-border)]" />
                <span>AI TRANSFORMS</span>
              </div>
            </div>

            {/* Right Column — Pipeline Panel */}
            <div className="lg:mt-7 mt-8">
              <HeroPipelinePanel />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ ENGINE PRIMITIVES ═══════════════ */}
      <section id="engine" className="py-20 px-6">
        <div ref={engineRef} className="reveal max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mb-16">
            <div>
              <SectionLabel>ENGINE PRIMITIVES</SectionLabel>
              <h2 className="font-mono font-bold text-3xl sm:text-4xl mt-4 leading-tight">
                The engine is the product.
              </h2>
            </div>
            <div className="lg:text-right">
              <p className="text-sm text-[var(--color-body)] leading-relaxed">
                Every surface below maps to a real execution concern:
                <br />
                ingest, branch, persist, retry, transform, observe.
              </p>
            </div>
          </div>

          {/* Cards Grid: 01 INGEST + 02 CONTROL FLOW */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 01 / INGEST */}
            <div
              ref={card1Ref}
              className="reveal card-hover border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)]"
            >
              <SectionLabel>01 / INGEST</SectionLabel>
              <SectionHeadingMono className="text-xl sm:text-2xl mt-3 mb-4">
                Webhook + polling triggers
              </SectionHeadingMono>
              <p className="text-sm text-[var(--color-body)] leading-relaxed mb-6">
                Receive events from an HTTP webhook or a polling loop, validate
                the payload, then enqueue work with BullMQ without losing the
                original trigger context.
              </p>
              {/* Code block */}
              <div className="bg-[var(--color-surface-elevated)] rounded-lg p-5 font-mono text-xs border border-[var(--color-border)]">
                <div className="text-[var(--color-muted)] mb-1">
                  <span className="text-[var(--color-accent)] font-semibold">POST</span>{" "}
                  /webhooks/in
                </div>
                <div className="text-[var(--color-muted)] mb-3">
                  x-flowline-signature: sha256...
                </div>
                <div className="text-[var(--color-muted)]">{"{"}</div>
                <div className="pl-4">
                  <span className="text-[var(--color-accent)]">&quot;event&quot;</span>
                  <span className="text-[var(--color-muted)]">: &quot;user.signup&quot;,</span>
                </div>
                <div className="pl-4">
                  <span className="text-[var(--color-accent)]">&quot;attempt&quot;</span>
                  <span className="text-[var(--color-muted)]">: 1,</span>
                </div>
                <div className="pl-4">
                  <span className="text-[var(--color-accent)]">
                    &quot;idempotency_key&quot;
                  </span>
                  <span className="text-[var(--color-muted)]">: &quot;evt_42&quot;</span>
                </div>
                <div className="text-[var(--color-muted)]">{"}"}</div>
              </div>
              <a
                href="#"
                className="inline-flex items-center gap-2 mt-6 font-mono text-xs tracking-wider text-[var(--color-accent)] hover:gap-3 transition-all duration-200"
              >
                INSPECT TRIGGER PATH →
              </a>
            </div>

            {/* 02 / CONTROL FLOW */}
            <div
              ref={card2Ref}
              className="reveal reveal-delay-1 card-hover border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)]"
            >
              <SectionLabel>02 / CONTROL FLOW</SectionLabel>
              <SectionHeadingMono className="text-xl sm:text-2xl mt-3 mb-4">
                Conditional paths
              </SectionHeadingMono>
              <p className="text-sm text-[var(--color-body)] leading-relaxed mb-6">
                Evaluate JSON keys or external responses and route each execution
                down the path it actually qualifies for.
              </p>
              {/* Branch diagram */}
              <BranchDiagram />
              <div className="flex items-center justify-between mt-4 font-mono text-xs text-[var(--color-muted)]">
                <span>JSON PREDICATE</span>
                <span>2 PATHS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CONTRACT BANNER ═══════════════ */}
      <section className="px-6">
        <div ref={contractRef} className="reveal max-w-7xl mx-auto">
          <div className="bg-[var(--color-accent)] rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="font-mono">
              <span className="text-black font-bold text-lg">
                execution_contract_v1.0
              </span>
            </div>
            <p className="text-black/80 text-sm flex-1 sm:ml-8 leading-relaxed">
              Idempotent triggers and persistent state keep the same event from
              running twice, even when a worker restarts mid-execution.
            </p>
            <span className="font-mono text-xs text-black/60 tracking-wider whitespace-nowrap">
              POSTGRESQL-BACKED
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════════ RELIABILITY PRIMITIVES ═══════════════ */}
      <section className="py-24 px-6">
        <div ref={reliabilityRef} className="reveal max-w-7xl mx-auto text-center mb-16">
          <SectionLabel>03 / RELIABILITY PRIMITIVES</SectionLabel>
          <h2 className="font-mono font-bold text-3xl sm:text-4xl md:text-5xl mt-4 leading-tight">
            State survives the worker.
          </h2>
          <p className="text-sm text-[var(--color-body)] mt-6 max-w-2xl mx-auto leading-relaxed">
            Flowline treats waiting, retrying, and resuming as first-class
            execution states—not edge cases hidden in a queue.
          </p>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 03 / DURABLE DELAY */}
          <div
            ref={card3Ref}
            className="reveal card-hover border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)] text-center"
          >
            <SectionLabel>03 / DURABLE DELAY</SectionLabel>
            <SectionHeadingMono className="text-xl sm:text-2xl mt-3 mb-4">
              Durable delay steps
            </SectionHeadingMono>
            <p className="text-sm text-[var(--color-body)] leading-relaxed mb-6 max-w-md mx-auto">
              Persist the next wake-up time and the exact step context in
              PostgreSQL. A worker can stop; the execution resumes from the
              saved state.
            </p>
            {/* Delay code block */}
            <div className="bg-[var(--color-surface-elevated)] rounded-lg p-5 font-mono text-xs border border-[var(--color-border)] text-left">
              <div>
                <span className="text-[var(--color-muted)]">checkpoint: </span>
                <span className="text-[var(--color-foreground)]">postgres</span>
              </div>
              <div>
                <span className="text-[var(--color-muted)]">resume_at: </span>
                <span className="text-[var(--color-foreground)]">
                  2026-08-06T14:30:00Z
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)]">step: </span>
                <span className="text-[var(--color-foreground)]">
                  delay.wait_10m
                </span>
              </div>
              <div>
                <span className="text-[var(--color-accent)]">status</span>
                <span className="text-[var(--color-muted)]">: </span>
                <span className="text-[var(--color-foreground)]">waiting</span>
              </div>
            </div>
          </div>

          {/* 04 / DELIVERY SAFETY */}
          <div
            ref={card4Ref}
            className="reveal reveal-delay-1 card-hover border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)]"
          >
            <SectionLabel>04 / DELIVERY SAFETY</SectionLabel>
            <SectionHeadingMono className="text-xl sm:text-2xl mt-3 mb-4">
              Exponential backoff
            </SectionHeadingMono>
            <p className="text-sm text-[var(--color-body)] leading-relaxed mb-6">
              Retry failures with explicit windows, bounded attempts, and
              idempotency keys so a transient outage never becomes a duplicate
              side effect.
            </p>
            {/* Backoff visualization */}
            <div className="bg-[var(--color-surface-elevated)] rounded-lg p-5 border border-[var(--color-border)]">
              <BackoffBars />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ AI STEP / TRACES ═══════════════ */}
      <section id="traces" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <div
            ref={aiRef}
            className="reveal grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mb-12"
          >
            <h2 className="font-mono font-bold text-3xl sm:text-4xl leading-tight">
              Make every step inspectable.
            </h2>
            <p className="text-sm text-[var(--color-body)] leading-relaxed lg:text-right">
              The AI step is just another durable node. Its inputs, output, and
              execution trace stay visible.
            </p>
          </div>

          {/* AI Step + Trace Panel */}
          <div
            ref={traceRef}
            className="reveal grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Left: AI Step card */}
            <div className="card-hover border border-[var(--color-border)] rounded-lg p-8 bg-[var(--color-surface)]">
              <div className="flex items-center justify-between mb-6">
                <SectionLabel>AI STEP / OPENROUTER</SectionLabel>
                <span className="px-3 py-1 border border-[var(--color-border)] rounded font-mono text-xs text-[var(--color-muted)]">
                  structured output
                </span>
              </div>
              <p className="text-sm text-[var(--color-body)] leading-relaxed mb-6">
                Transform unstructured input with an LLM while preserving the
                surrounding execution context.
              </p>
              {/* Input/Output code block */}
              <div className="bg-[var(--color-surface-elevated)] rounded-lg p-5 font-mono text-xs border border-[var(--color-border)]">
                <div className="text-[var(--color-muted)] mb-1">// input</div>
                <div className="text-[var(--color-accent)] mb-4">
                  &nbsp;&nbsp;&quot;Summarize ticket and extract product IDs&quot;
                </div>
                <div className="text-[var(--color-muted)] mb-1">// output</div>
                <div className="text-[var(--color-muted)]">{"{"}</div>
                <div className="pl-4">
                  <span className="text-[var(--color-foreground)]">
                    &nbsp;&nbsp;&quot;sentiment&quot;
                  </span>
                  <span className="text-[var(--color-muted)]">: &quot;critical&quot;,</span>
                </div>
                <div className="pl-4">
                  <span className="text-[var(--color-foreground)]">
                    &nbsp;&nbsp;&quot;tags&quot;
                  </span>
                  <span className="text-[var(--color-muted)]">
                    : [&quot;refund&quot;, &quot;billing&quot;],
                  </span>
                </div>
                <div className="pl-4">
                  <span className="text-[var(--color-foreground)]">
                    &nbsp;&nbsp;&quot;product_ids&quot;
                  </span>
                  <span className="text-[var(--color-muted)]">
                    : [&quot;PROD-882&quot;]
                  </span>
                </div>
                <div className="text-[var(--color-muted)]">{"}"}</div>
              </div>
            </div>

            {/* Right: Execution Trace */}
            <div className="card-hover border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
                <span className="font-mono text-xs tracking-wider text-[var(--color-muted)]">
                  EXAMPLE EXECUTION TRACE
                </span>
                <span className="px-3 py-1 border border-[var(--color-accent)] rounded font-mono text-xs text-[var(--color-accent)]">
                  demo_88192a
                </span>
              </div>
              <div className="p-6 flex-1">
                <AnimatedTrace />
              </div>
              <div className="px-6 py-4 border-t border-[var(--color-border)]">
                <p className="font-mono text-xs text-[var(--color-muted)] text-center">
                  Sample trace for illustration. Production history is emitted by
                  your Flowline worker.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA SECTION ═══════════════ */}
      <section className="py-32 px-6">
        <div ref={ctaRef} className="reveal max-w-7xl mx-auto text-center">
          <SectionLabel>06 / DEPLOY YOUR FIRST WORKER</SectionLabel>
          <h2 className="font-mono font-bold text-3xl sm:text-4xl md:text-5xl mt-6 leading-tight">
            Build workflows
            <br />
            <span className="text-[var(--color-accent)]">that keep state.</span>
          </h2>
          <p className="text-sm text-[var(--color-body)] mt-6 max-w-xl mx-auto leading-relaxed">
            Bring durable orchestration to your private infrastructure with a
            Node.js engine you can inspect from trigger to trace.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/signup"
              className="px-8 py-3 bg-[var(--color-accent)] text-black font-mono text-xs tracking-wider font-semibold rounded hover:bg-[#d4ff52] hover:shadow-[0_0_30px_rgba(196,245,66,0.3)] transition-all duration-300 inline-block text-center"
            >
              GET STARTED
            </Link>
            <button className="px-8 py-3 border border-[var(--color-border)] text-[var(--color-foreground)] font-mono text-xs tracking-wider rounded hover:border-[var(--color-foreground)] transition-all duration-200">
              SEE HOW IT WORKS
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="border-t border-[var(--color-border)] py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded bg-[var(--color-accent)] flex items-center justify-center">
              <span className="text-black font-mono font-bold text-[10px]">
                F
              </span>
            </div>
            <span className="font-mono text-xs tracking-wider text-[var(--color-muted)]">
              FLOWLINE V0.9.4 / ENGINE CORE
            </span>
          </div>
          <div className="flex items-center gap-5 font-mono text-xs tracking-wider text-[var(--color-muted)]">
            <a
              href="#engine"
              className="hover:text-[var(--color-foreground)] transition-colors"
            >
              ENGINE
            </a>
            <a
              href="#traces"
              className="hover:text-[var(--color-foreground)] transition-colors"
            >
              TRACES
            </a>
            <a
              href="#"
              className="hover:text-[var(--color-foreground)] transition-colors"
            >
              BACK TO TOP
            </a>
          </div>
          <span className="font-mono text-xs tracking-wider text-[var(--color-muted)]">
            NODE.JS · BULLMQ · POSTGRESQL
          </span>
        </div>
      </footer>
    </div>
  );
}
