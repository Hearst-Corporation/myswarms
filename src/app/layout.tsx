import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// Pont temporaire ancien vocabulaire ct-* → tokens neufs. Voir src/design/compat.css.
import "../design/compat.css";
import { HiveShell } from "@/components/HiveShell";
import { HubSessionBridge } from "@/components/HubSessionBridge";
import { TenantConfigProvider } from "@/components/cockpit/TenantConfigProvider";
import { DashboardSwitcher } from "@/components/cockpit/DashboardSwitcher";
import { getTenantConfig } from "@/lib/tenant/config";
import { getSuperAdmin } from "@/lib/auth/superAdmin";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MySwarms",
  description: "MySwarms — orchestration de swarms & crews multi-agents",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [tenantConfig, superAdmin] = await Promise.all([
    getTenantConfig(),
    getSuperAdmin(),
  ]);
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <HubSessionBridge />
        <DashboardSwitcher />
        <TenantConfigProvider value={{ ...tenantConfig, isSuperAdmin: superAdmin !== null }}>
          <HiveShell>{children}</HiveShell>
        </TenantConfigProvider>
      </body>
    </html>
  );
}
