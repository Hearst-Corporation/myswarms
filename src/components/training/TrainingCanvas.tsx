"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GpuMetrics {
  vram: number;
  temp: number;
  tps:  number;
}

interface BrainNode {
  x: number;
  y: number;
}

type GpuDomSet = {
  vramBar: HTMLDivElement | null;
  vramPct: HTMLSpanElement | null;
  tempVal: HTMLSpanElement | null;
  tpsVal:  HTMLSpanElement | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const GPU_LABELS    = ["GPU0", "GPU1", "GPU2", "GPU3", "GPU4", "GPU5", "GPU6", "GPU7"];
const RACK_LEFT     = [0, 1, 2, 3];
const RACK_RIGHT    = [4, 5, 6, 7];

const INITIAL_LOSS   = 0.2341;
const LOSS_FLOOR     = 0.089;
const LOSS_STEP      = 0.000018;
const INITIAL_STEP   = 4721;
const INITIAL_TOKENS = 14_820_000_000;

const COLORS = {
  bg:      "#080811",
  card:    "#0f0f1a",
  border:  "#1e1e3a",
  accent:  "#6366f1",
  green:   "#22c55e",
  amber:   "#f59e0b",
  muted:   "#4b4b6b",
  text:    "#e2e2f0",
  textDim: "#8888aa",
};

// ── Seed data (no Math.random at module level either — fixed values) ──────────

const GPU_SEED: GpuMetrics[] = [
  { vram: 82, temp: 72, tps: 2800 },
  { vram: 75, temp: 68, tps: 3100 },
  { vram: 91, temp: 78, tps: 2400 },
  { vram: 67, temp: 70, tps: 3500 },
  { vram: 88, temp: 75, tps: 2600 },
  { vram: 73, temp: 71, tps: 3200 },
  { vram: 95, temp: 80, tps: 2200 },
  { vram: 79, temp: 73, tps: 2900 },
];

// Fixed radii ratios for brain nodes (replaces Math.random)
const NODE_RADII = [
  0.35, 0.70, 0.55, 0.80, 0.42, 0.65, 0.90, 0.30, 0.75, 0.50,
  0.38, 0.85, 0.60, 0.45, 0.72, 0.28, 0.92, 0.58, 0.68, 0.40,
];

// ── Layout ────────────────────────────────────────────────────────────────────

const CARD_W   = 140;
const CARD_H   = 88;
const VB_W     = 1000;
const VB_H     = 700;
const BRAIN_CX = 500;
const BRAIN_CY = 380;

// ── Pure helpers ──────────────────────────────────────────────────────────────

function drift(val: number, min: number, max: number, step: number): number {
  const delta = (Math.random() - 0.5) * 2 * step;
  return Math.min(max, Math.max(min, val + delta));
}

function fmtLoss(v: number): string {
  return v.toFixed(4);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatElapsed(ms: number): string {
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

function makeBrainNodes(r: number): BrainNode[] {
  const count = 20;
  return Array.from({ length: count }, (_, i) => {
    const angle  = (i / count) * 2 * Math.PI;
    const radius = r * NODE_RADII[i];
    return {
      x: BRAIN_CX + Math.cos(angle) * radius,
      y: BRAIN_CY + Math.sin(angle) * radius,
    };
  });
}

function getCardPos(idx: number): { x: number; y: number } {
  const isRight = idx >= 4;
  const local   = isRight ? idx - 4 : idx;
  const col     = Math.floor(local / 2);
  const row     = local % 2;
  const rackCX  = isRight ? 840 : 160;
  const baseX   = rackCX + (col === 0 ? -(CARD_W / 2 + 6) : CARD_W / 2 + 6) - CARD_W / 2;
  const baseY   = 200 + row * (CARD_H + 20);
  return { x: baseX, y: baseY };
}

function streamPath(idx: number): string {
  const { x, y } = getCardPos(idx);
  const cx      = x + CARD_W / 2;
  const cy      = y + CARD_H / 2;
  const isRight = idx >= 4;
  const cpX     = isRight ? BRAIN_CX + 150 : BRAIN_CX - 150;
  const cpY     = (cy + BRAIN_CY) / 2;
  return `M ${cx} ${cy} Q ${cpX} ${cpY} ${BRAIN_CX} ${BRAIN_CY}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, color: COLORS.textDim, letterSpacing: "0.14em", fontWeight: 700, fontFamily: "'SF Mono','Fira Mono',monospace" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 700, fontFamily: "'SF Mono',monospace" }}>
        {children}
      </span>
    </div>
  );
}

// GpuCard is a standalone component so it never reads parent refs during render.
function GpuCard({
  idx,
  seed,
  domSetRef,
}: {
  idx:       number;
  seed:      GpuMetrics;
  domSetRef: React.MutableRefObject<GpuDomSet>;
}) {
  const pos = getCardPos(idx);

  return (
    <foreignObject
      x={pos.x}
      y={pos.y}
      width={CARD_W}
      height={CARD_H}
      style={{ overflow: "visible" }}
    >
      <div
        style={{
          width: CARD_W,
          height: CARD_H,
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          boxSizing: "border-box",
          fontFamily: "'SF Mono','Fira Mono',monospace",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.text, letterSpacing: "0.08em" }}>
            RTX 4090 · {GPU_LABELS[idx]}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: COLORS.green, display: "inline-block",
              animation: "pulse-dot 1.4s ease-in-out infinite",
              animationDelay: `${idx * 0.18}s`,
            }} />
            <span style={{ fontSize: 9, color: COLORS.green, fontWeight: 600 }}>ACTIVE</span>
          </span>
        </div>

        {/* VRAM bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 9, color: COLORS.textDim }}>VRAM</span>
            <span
              ref={(el) => { domSetRef.current.vramPct = el; }}
              style={{ fontSize: 9, color: COLORS.accent, fontWeight: 700 }}
            >
              {seed.vram.toFixed(0)}%
            </span>
          </div>
          <div style={{ height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
            <div
              ref={(el) => { domSetRef.current.vramBar = el; }}
              style={{
                height: "100%",
                width: `${seed.vram.toFixed(0)}%`,
                background: `linear-gradient(90deg, ${COLORS.accent}, #818cf8)`,
                borderRadius: 2,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* Temp + TPS */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 9, color: COLORS.textDim }}>TEMP</span>
            <span
              ref={(el) => { domSetRef.current.tempVal = el; }}
              style={{ fontSize: 9, fontWeight: 700, color: seed.temp >= 77 ? COLORS.amber : COLORS.text }}
            >
              {seed.temp.toFixed(0)}°C
            </span>
          </span>
          <span
            ref={(el) => { domSetRef.current.tpsVal = el; }}
            style={{ fontSize: 9, color: COLORS.textDim }}
          >
            {(seed.tps / 1000).toFixed(1)}K t/s
          </span>
        </div>
      </div>
    </foreignObject>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TrainingCanvas() {
  // State for render-driven visuals
  const [brainR,     setBrainR]     = useState<number>(60);
  const [brainNodes, setBrainNodes] = useState<BrainNode[]>(() => makeBrainNodes(60));
  const [dashOffset, setDashOffset] = useState<number>(0);

  // Mutable counters — never read during render
  const gpuMetrics = useRef<GpuMetrics[]>(GPU_SEED.map((g) => ({ ...g })));
  const stepRef    = useRef<number>(INITIAL_STEP);
  const tokensRef  = useRef<number>(INITIAL_TOKENS);
  const lossRef    = useRef<number>(INITIAL_LOSS);
  const mountTime  = useRef<number>(0);

  // DOM refs per GPU card — each is a stable object (no .current access in render)
  const gpuDom0 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom1 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom2 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom3 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom4 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom5 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom6 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  const gpuDom7 = useRef<GpuDomSet>({ vramBar: null, vramPct: null, tempVal: null, tpsVal: null });
  // Stable array for interval updates — populated once in effect
  const gpuDomArray = useRef<React.MutableRefObject<GpuDomSet>[]>([]);
  useEffect(() => {
    gpuDomArray.current = [gpuDom0, gpuDom1, gpuDom2, gpuDom3, gpuDom4, gpuDom5, gpuDom6, gpuDom7];
  }, []);

  // DOM refs for global stats
  const tokensDomRef  = useRef<HTMLSpanElement | null>(null);
  const stepDomRef    = useRef<SVGTSpanElement | null>(null);
  const lossDomRef    = useRef<SVGTSpanElement | null>(null);
  const elapsedDomRef = useRef<HTMLSpanElement | null>(null);
  const totalVramRef  = useRef<HTMLSpanElement | null>(null);

  // Record mount time safely in effect
  useEffect(() => {
    mountTime.current = Date.now();
  }, []);

  // GPU metrics tick (500ms)
  useEffect(() => {
    const id = setInterval(() => {
      gpuMetrics.current = gpuMetrics.current.map((g) => ({
        vram: drift(g.vram, 62, 98, 4),
        temp: drift(g.temp, 65, 82, 1.5),
        tps:  drift(g.tps,  1800, 4200, 120),
      }));
      gpuMetrics.current.forEach((g, i) => {
        const d = gpuDomArray.current[i]?.current;
        if (!d) return;
        if (d.vramBar)  d.vramBar.style.width = `${g.vram.toFixed(0)}%`;
        if (d.vramPct)  d.vramPct.textContent = `${g.vram.toFixed(0)}%`;
        if (d.tempVal)  d.tempVal.textContent = `${g.temp.toFixed(0)}°C`;
        if (d.tpsVal)   d.tpsVal.textContent  = `${(g.tps / 1000).toFixed(1)}K t/s`;
      });
      const avg = gpuMetrics.current.reduce((a, g) => a + g.vram, 0) / 8;
      if (totalVramRef.current) totalVramRef.current.textContent = `${avg.toFixed(0)}%`;
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Step / tokens / loss tick (100ms)
  useEffect(() => {
    const id = setInterval(() => {
      stepRef.current   += 1;
      tokensRef.current += Math.floor(1_200_000 + Math.random() * 400_000);
      if (lossRef.current > LOSS_FLOOR) {
        lossRef.current = Math.max(LOSS_FLOOR, lossRef.current - LOSS_STEP);
      }
      if (stepDomRef.current)   stepDomRef.current.textContent   = stepRef.current.toLocaleString();
      if (tokensDomRef.current) tokensDomRef.current.textContent = fmtTokens(tokensRef.current);
      if (lossDomRef.current)   lossDomRef.current.textContent   = fmtLoss(lossRef.current);
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Elapsed timer (1s)
  useEffect(() => {
    const id = setInterval(() => {
      if (elapsedDomRef.current) {
        elapsedDomRef.current.textContent = formatElapsed(Date.now() - mountTime.current);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Brain grows (2s)
  useEffect(() => {
    const id = setInterval(() => {
      setBrainR((r) => {
        const next = Math.min(90, r + 0.5);
        setBrainNodes(makeBrainNodes(next));
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Stream dash animation (RAF)
  useEffect(() => {
    let raf: number;
    let offset = 0;
    const animate = () => {
      offset = (offset + 2) % 40;
      setDashOffset(offset);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", height: "100%", background: COLORS.bg, display: "flex", flexDirection: "column" }}>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes brain-outer-glow {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.32; }
        }
        @keyframes node-blink {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 0.9; }
        }
        @keyframes loss-fade {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.7; }
        }
      `}</style>

      <div style={{ flex: 1, position: "relative" }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height="100%"
          style={{ display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="tg-brain-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={COLORS.accent} stopOpacity="0.45" />
              <stop offset="60%"  stopColor={COLORS.accent} stopOpacity="0.12" />
              <stop offset="100%" stopColor={COLORS.accent} stopOpacity="0"    />
            </radialGradient>
          </defs>

          {/* Rack labels */}
          <text x={160} y={170} textAnchor="middle" fill={COLORS.muted} fontSize={11}
            fontFamily="'SF Mono',monospace" letterSpacing="0.14em" fontWeight={700}>
            GPU1 RACK · 4× RTX 4090
          </text>
          <text x={840} y={170} textAnchor="middle" fill={COLORS.muted} fontSize={11}
            fontFamily="'SF Mono',monospace" letterSpacing="0.14em" fontWeight={700}>
            GPU2 RACK · 4× RTX 4090
          </text>

          {/* Data streams — dashed flowing */}
          {[...RACK_LEFT, ...RACK_RIGHT].map((idx) => (
            <path
              key={`s-${idx}`}
              d={streamPath(idx)}
              fill="none"
              stroke={COLORS.accent}
              strokeWidth={1.5}
              strokeOpacity={0.35}
              strokeDasharray="20 20"
              strokeDashoffset={-dashOffset}
            />
          ))}

          {/* Bright particle on streams */}
          {[...RACK_LEFT, ...RACK_RIGHT].map((idx) => (
            <path
              key={`sb-${idx}`}
              d={streamPath(idx)}
              fill="none"
              stroke="#a5b4fc"
              strokeWidth={2.5}
              strokeOpacity={0.65}
              strokeDasharray="4 56"
              strokeDashoffset={-((dashOffset * 1.8 + idx * 7) % 60)}
            />
          ))}

          {/* Brain glow halo */}
          <circle
            cx={BRAIN_CX}
            cy={BRAIN_CY}
            r={brainR + 50}
            fill="url(#tg-brain-glow)"
            style={{ animation: "brain-outer-glow 3s ease-in-out infinite" }}
          />

          {/* Brain web lines */}
          {brainNodes.map((n, i) =>
            brainNodes.slice(i + 1, i + 4).map((m, j) => (
              <line
                key={`bl-${i}-${j}`}
                x1={n.x} y1={n.y}
                x2={m.x} y2={m.y}
                stroke={COLORS.accent}
                strokeOpacity={0.18}
                strokeWidth={0.8}
              />
            ))
          )}

          {/* Brain nodes */}
          {brainNodes.map((n, i) => (
            <circle
              key={`bn-${i}`}
              cx={n.x}
              cy={n.y}
              r={2.5}
              fill={COLORS.accent}
              style={{
                animation: "node-blink 2s ease-in-out infinite",
                animationDelay: `${(i * 0.13) % 2}s`,
              }}
            />
          ))}

          {/* Brain ring */}
          <circle
            cx={BRAIN_CX}
            cy={BRAIN_CY}
            r={brainR}
            fill="none"
            stroke={COLORS.accent}
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeDasharray="6 4"
          />

          {/* LOSS — large, dramatic */}
          <text
            x={BRAIN_CX}
            y={BRAIN_CY + brainR + 36}
            textAnchor="middle"
            fill={COLORS.accent}
            fontSize={28}
            fontFamily="'SF Mono','Fira Mono',monospace"
            fontWeight={700}
            letterSpacing="0.04em"
            style={{ animation: "loss-fade 2s ease-in-out infinite" }}
          >
            {"LOSS: "}
            <tspan ref={(el) => { lossDomRef.current = el; }}>
              {fmtLoss(INITIAL_LOSS)}
            </tspan>
          </text>

          {/* PARAMS + STEP */}
          <text x={BRAIN_CX - 70} y={BRAIN_CY + brainR + 62} textAnchor="middle"
            fill={COLORS.textDim} fontSize={11} fontFamily="'SF Mono',monospace">
            PARAMS: 32B
          </text>
          <text x={BRAIN_CX + 70} y={BRAIN_CY + brainR + 62} textAnchor="middle"
            fill={COLORS.textDim} fontSize={11} fontFamily="'SF Mono',monospace">
            {"STEP: "}
            <tspan ref={(el) => { stepDomRef.current = el; }}>
              {INITIAL_STEP.toLocaleString()}
            </tspan>
          </text>

          {/* GPU Cards — each receives a stable ref object, no .current in render */}
          {([
            [0, gpuDom0], [1, gpuDom1], [2, gpuDom2], [3, gpuDom3],
            [4, gpuDom4], [5, gpuDom5], [6, gpuDom6], [7, gpuDom7],
          ] as [number, React.MutableRefObject<GpuDomSet>][]).map(([idx, domRef]) => (
            <GpuCard
              key={idx}
              idx={idx}
              seed={GPU_SEED[idx]}
              domSetRef={domRef}
            />
          ))}
        </svg>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 32,
        padding: "10px 28px",
        borderTop: `1px solid ${COLORS.border}`,
        background: "rgba(8,8,17,0.95)",
        flexShrink: 0,
      }}>
        <StatItem label="TOKENS PROCESSED">
          <span ref={(el) => { tokensDomRef.current = el; }}>
            {fmtTokens(INITIAL_TOKENS)}
          </span>
        </StatItem>
        <StatItem label="ACTIVE GPUs">
          <span>8 / 8</span>
        </StatItem>
        <StatItem label="AVG VRAM">
          <span ref={(el) => { totalVramRef.current = el; }}>79%</span>
        </StatItem>
        <StatItem label="TRAINING TIME">
          <span ref={(el) => { elapsedDomRef.current = el; }}>00:00:00</span>
        </StatItem>
        <StatItem label="MODEL">
          <span style={{ color: COLORS.accent }}>32B · Kimi K2.6</span>
        </StatItem>
        <StatItem label="STATUS">
          <span style={{ color: COLORS.green }}>● RUNNING</span>
        </StatItem>
      </div>
    </div>
  );
}
