import { SPACING, FONT } from "@/lib/ui/tokens";

const CARDS = [
  {
    icon: "🪞",
    title: "Replay du Chief",
    desc: "Scrubber temporel qui rejoue minute par minute les décisions des agents. Tu pauses à n'importe quel moment, tu corriges une priorité, l'agent apprend rétroactivement. Moat unique.",
  },
  {
    icon: "🌅",
    title: "Shadow Day",
    desc: "À 07:00, l'agent simule ta journée si tu ne fais rien (mails qui pourrissent, RDV qui sautent, deadlines ratées). Tu valides ou réécris le scénario.",
  },
  {
    icon: "🤝",
    title: "Trust Score",
    desc: "Score appris par contact (latence de réponse, ton, sensibilité). L'agent refuse un brouillon trop froid pour un P0. Visible et éditable.",
  },
] as const;

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
            <span style={{ fontSize: FONT.xl }}>{card.icon}</span>
            <span
              style={{
                fontSize: FONT.base,
                fontWeight: 700,
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
              lineHeight: 1.6,
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
