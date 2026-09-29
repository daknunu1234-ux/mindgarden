import type { Metadata } from "next";
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, LoginDialog, ProfileButton } from "@/features/auth";
import { getStreak, isDevTopUpAllowed, simulateCoinTopUp, StreakBadge } from "@/features/progress";
import { CoinShopModal, GameButton } from "@/shared/components/game";
import { LoginDialogProvider } from "@/shared/stores/LoginDialogProvider";
import { StreakProvider } from "@/shared/stores/StreakProvider";
import { ToastProvider } from "@/shared/stores/ToastProvider";
import { CoinShopProvider } from "@/shared/stores/CoinShopProvider";
import { CoinsProvider } from "@/shared/stores/CoinsProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Rounded display face for game UI (buttons, plaques, HUD). Vietnamese subset for deck titles.
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "MindGarden",
  description: "Grow a tree for every deck you master.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [res, streakRes] = await Promise.all([getCurrentUser(), getStreak()]);
  const user = res.success ? res.data : null;
  const streak = streakRes.success && streakRes.data ? streakRes.data : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LoginDialogProvider>
          <ToastProvider>
          <CoinsProvider>
          <CoinShopProvider>
          <StreakProvider initial={streak && { current: streak.current, best: streak.best, practicedToday: streak.practicedToday }}>
          {/* Wooden top bar: carved logo, plant button, streak capsule, gardener badge. */}
          <header className="relative z-40 border-b-[3px] border-amber-950/60 bg-gradient-to-b from-amber-700 to-amber-800 shadow-[inset_0_2px_0_rgba(255,255,255,0.15),0_4px_0_rgba(69,26,3,0.35)]">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
              <Link
                href="/"
                className="flex items-center gap-1.5 rounded-xl font-game text-xl font-extrabold tracking-tight text-amber-50 [text-shadow:0_2px_0_rgba(69,26,3,0.7)] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
              >
                <span aria-hidden className="text-2xl">
                  🌳
                </span>
                MindGarden
              </Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <GameButton asChild tone="leaf" size="sm" className="hidden sm:inline-flex">
                  <Link href="/deck/new">Plant a Tree 🌱</Link>
                </GameButton>
                {user && <StreakBadge />}
                <ProfileButton user={user} />
              </div>
            </div>
          </header>
          {children}
          {/* useSearchParams inside needs a Suspense boundary for static routes like /_not-found. */}
          <Suspense>
            <LoginDialog />
          </Suspense>
          {/* One Coin Shop for the whole app (opened from the HUD "+" and "Get More Coins").
              The free top-up is wired only outside production builds. */}
          <CoinShopModal signedIn={user !== null} simulateTopUp={isDevTopUpAllowed() ? simulateCoinTopUp : null} />
          </StreakProvider>
          </CoinShopProvider>
          </CoinsProvider>
          </ToastProvider>
        </LoginDialogProvider>
      </body>
    </html>
  );
}
