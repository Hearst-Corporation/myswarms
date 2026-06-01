import { SPACING, RADIUS } from "@/lib/ui/tokens";

/**
 * Layout de l'espace Automobile — applique l'identité de marque Azur Premium
 * Motors (logo en tête) à toutes les pages /automobile/*. L'accent couleur est
 * posé par le DashboardSwitcher via <html data-product="automobile">.
 */
export default function AutomobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div style={{ marginBottom: SPACING.lg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/azur-logo.jpg"
          alt="Azur Premium Motors"
          style={{
            height: 40,
            width: "auto",
            display: "block",
            borderRadius: RADIUS.sm,
          }}
        />
      </div>
      {children}
    </>
  );
}
