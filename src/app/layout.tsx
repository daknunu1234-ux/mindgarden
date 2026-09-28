import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, LoginDialog, ProfileButton } from "@/features/auth";
import { getStreak, StreakBadge } from "@/features/progress";
import { Button } from "@/shared/components/ui/button";
import { LoginDialogProvider } from "@/shared/stores/LoginDialogProvider";
import { StreakProvider } from "@/shared/stores/StreakProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LoginDialogProvider>
          <StreakProvider initial={streak && { current: streak.current, best: streak.best, practicedToday: streak.practicedToday }}>
          <header className="border-b">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <Link href="/" className="font-semibold tracking-tight">
                MindGarden 🌳
              </Link>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <Link href="/deck/new">Plant a Tree 🌱</Link>
                </Button>
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
          </StreakProvider>
        </LoginDialogProvider>
      </body>
    </html>
  );
}
