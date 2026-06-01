import type { Metadata } from "next";
import "./globals.css";
import "@hearst/cockpit-shell/tokens.css";
import "./cockpit.css";
import { HiveShell } from "@/components/HiveShell";
import { HubSessionBridge } from "@/components/HubSessionBridge";
import { TenantConfigProvider } from "@/components/cockpit/TenantConfigProvider";
import { getTenantConfig } from "@/lib/tenant/config";

export const metadata: Metadata = {
  title: "Hearst Hive",
  description: "Hearst Hive — swarms & crews orchestration",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantConfig = await getTenantConfig();
  return (
    <html lang="fr">
      <body>
        <HubSessionBridge />
        <TenantConfigProvider value={tenantConfig}>
          <HiveShell>{children}</HiveShell>
        </TenantConfigProvider>
      </body>
    </html>
  );
}
