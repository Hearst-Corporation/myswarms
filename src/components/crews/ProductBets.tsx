import type { ReactNode } from "react";
import { SPACING, FONT, FONT_WEIGHT, LINE_HEIGHT } from "@/lib/ui/tokens";

const MirrorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="5" />
    <ellipse cx="8" cy="8" rx="2.5" ry="5" />
  </svg>
);

const SunriseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="11" x2="14" y2="11" />
    <path d="M4 11 A4 4 0 0 1 12 11" />
    <line x1="8" y1="3" x2="8" y2="5" />
    <line x1="3.5" y1="5" x2="4.5" y2="6" />
    <line x1="12.5" y1="5" x2="11.5" y2="6" />
  </svg>
);

const TrustIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="2.5" />
  </svg>
);

const CARDS: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <MirrorIcon />,
    title: "Replay du Chief",
    desc: "Scrubber temporel qui rejoue minute par minute les décisions des agents. Tu pauses à n'importe quel moment, tu corriges une priorité, l'agent apprend rétroactivement. Moat unique.",
  },
  {
    icon: <SunriseIcon />,
    title: "Shadow Day",
    desc: "À 07:00, l'agent simule ta journée si tu ne fais rien (mails qui pourrissent, RDV qui sautent, deadlines ratées). Tu valides ou réécris le scénario.",
  },
  {
    icon: <TrustIcon />,
    title: "Trust Score",
    desc: "Score appris par contact (latence de réponse, ton, sensibilité). L'agent refuse un brouillon trop froid pour un P0. Visible et éditable.",
  },
];

export function ProductBets() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: SPACING.lg,
      }}
    >
      {CARDS.map((card) => (
        <div
          key={card.title}
          className="ct-card"
          style={{
            borderTop: "2px solid var(--cos-accent)",
            display: "flex",
            flexDirection: "column",
            gap: SPACING.md,
          }}
        >
          {/* Title + icon */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            <span style={{ display: "flex", alignItems: "center" }}>{card.icon}</span>
            <span
              style={{
                fontSize: FONT.base,
                fontWeight: FONT_WEIGHT.bold,
                color: "var(--ct-text-primary)",
              }}
            >
              {card.title}
            </span>
          </div>

          {/* Description */}
          <p
            style={{
              fontSize: FONT.base,
              color: "var(--ct-text-body)",
              lineHeight: LINE_HEIGHT.base,
              margin: 0,
            }}
          >
            {card.desc}
          </p>
        </div>
      ))}
    </div>
  );
}
