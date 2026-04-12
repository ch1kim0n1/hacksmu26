import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import { SceneTransitionProvider } from "@/components/transition/SceneTransitionProvider";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EchoField",
  description:
    "Elephant vocalization analysis platform for field researchers — HackSMU 2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jakarta.variable}`}>
      <body className="bg-ev-ivory text-ev-charcoal font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <SceneTransitionProvider>
            <AppShell>{children}</AppShell>
          </SceneTransitionProvider>
        </div>
      </body>
    </html>
  );
}
