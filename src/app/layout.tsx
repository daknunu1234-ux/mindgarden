import type { Metadata } from "next";
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, LoginDialog, ProfileButton } from "@/features/auth";
import { FruitBadge, getFarmInventory } from "@/features/garden";
import { NotificationToaster } from "@/features/notifications";
import { getMembership, PaymentModal, UpgradeButton } from "@/features/payment";
import { CoinsBadge, getFarmHud, isDevTopUpAllowed, simulateCoinTopUp, StreakBadge } from "@/features/progress";
import { CoinShopModal, GameButton } from "@/shared/components/game";
import { LIGHTING_BOOT_SCRIPT } from "@/shared/lib/lightingBoot";
import { LoginDialogProvider } from "@/shared/stores/LoginDialogProvider";
import { StreakProvider } from "@/shared/stores/StreakProvider";
import { ToastProvider } from "@/shared/stores/ToastProvider";
import { CoinShopProvider } from "@/shared/stores/CoinShopProvider";
import { CoinsProvider } from "@/shared/stores/CoinsProvider";
import { FruitProvider } from "@/shared/stores/FruitProvider";
import { PaymentDialogProvider } from "@/shared/stores/PaymentDialogProvider";
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
  display: "swap",
});

export const metadata: Metadata = {
  title: "MindGarden",
  description: "Grow a tree for every deck you master.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Streak and coins for the header (one load per request, shared with the page). Reading them
  // never grows the streak: only watering a tree does.
  const [res, hudRes, inventoryRes, membershipRes] = await Promise.all([getCurrentUser(), getFarmHud(), getFarmInventory(), getMembership()]);
  // ⭐ Pro membership and whether this server takes PayOS payments (the Upgrade button and dialog).
  const membership = membershipRes.success ? membershipRes.data : { isPro: false, lifetime: false, proUntil: null, paymentsEnabled: false };
  // The island's fruit for the header (beside the coins); null when signed out or unreadable.
  const inventory = inventoryRes.success ? inventoryRes.data : null;
  const user = res.success ? res.data : null;
  const hud = hudRes.success ? hudRes.data : null;
  const streak = hud?.streak ?? null;

  return (
    // suppressHydrationWarning: the lighting boot script below marks <html> before React hydrates.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${baloo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Decides day or night for the farm before the first paint (no flash of daylight at night). */}
        <script dangerouslySetInnerHTML={{ __html: LIGHTING_BOOT_SCRIPT }} />
        <LoginDialogProvider>
          <ToastProvider>
          <CoinsProvider>
          <FruitProvider>
          <CoinShopProvider>
          <PaymentDialogProvider>
          <StreakProvider initial={streak && { current: streak.current, best: streak.best, practicedToday: streak.practicedToday }}>
          {/* Wooden top bar: carved logo, plant button, then the player's stats (🔥 streak, 🍎 fruit, 🪙 coins)
              next to the gardener badge. */}
          <header className="relative z-40 border-b-[3px] border-amber-950/60 bg-gradient-to-b from-amber-700 to-amber-800 shadow-[inset_0_2px_0_rgba(255,255,255,0.15),0_4px_0_rgba(69,26,3,0.35)]">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:gap-3 sm:px-6">
              <Link
                href="/"
                aria-label="MindGarden"
                className="flex shrink-0 items-center gap-1.5 rounded-xl font-game text-xl font-extrabold tracking-tight text-amber-50 [text-shadow:0_2px_0_rgba(69,26,3,0.7)] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
              >
                <span aria-hidden className="text-2xl">
                  🌳
                </span>
                {/* Signed in on a phone, the stats need the room: the tree alone is the logo. */}
                <span className={user ? "hidden sm:inline" : undefined}>MindGarden</span>
              </Link>
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <GameButton asChild tone="leaf" size="sm" className="hidden md:inline-flex">
                  <Link href="/deck/new">Plant a Tree 🌱</Link>
                </GameButton>
                {user && hud && (
                  <>
                    <StreakBadge />
                    {inventory && <FruitBadge fruit={inventory.fruit} fruitAsOf={inventory.asOf} />}
                    <CoinsBadge coins={hud.coins} coinsAsOf={hud.coinsAsOf} />
                  </>
                )}
                {user && <UpgradeButton membership={membership} paymentsEnabled={membership.paymentsEnabled} className="hidden sm:flex" />}
                <ProfileButton user={user} />
              </div>
            </div>
          </header>
          {/* Unread notices for the signed-in gardener (someone cloned their tree…), as toasts. */}
          {user && <NotificationToaster />}
          {children}
          {/* useSearchParams inside needs a Suspense boundary for static routes like /_not-found. */}
          <Suspense>
            <LoginDialog />
          </Suspense>
          {/* One Coin Shop for the whole app (opened from the HUD "+" and "Get More Coins").
              The free top-up is wired only outside production builds. */}
          <CoinShopModal signedIn={user !== null} simulateTopUp={isDevTopUpAllowed() ? simulateCoinTopUp : null} paymentsEnabled={membership.paymentsEnabled} />
          {/* ⭐ Upgrade: Pro and coin packs paid with PayOS (VietQR), opened from the header and the Coin Shop. */}
          <PaymentModal signedIn={user !== null} paymentsEnabled={membership.paymentsEnabled} membership={membership} />
          </StreakProvider>
          </PaymentDialogProvider>
          </CoinShopProvider>
          </FruitProvider>
          </CoinsProvider>
          </ToastProvider>
        </LoginDialogProvider>
      </body>
    </html>
  );
}
