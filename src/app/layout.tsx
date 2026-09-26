import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, LoginDialog, ProfileButton } from "@/features/auth";
import { LoginDialogProvider } from "@/shared/stores/LoginDialogProvider";
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
  const res = await getCurrentUser();
  const user = res.success ? res.data : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LoginDialogProvider>
          <header className="border-b">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <Link href="/" className="font-semibold tracking-tight">
                MindGarden 🌳
              </Link>
              <ProfileButton user={user} />
            </div>
          </header>
          {children}
          {/* useSearchParams inside needs a Suspense boundary for static routes like /_not-found. */}
          <Suspense>
            <LoginDialog />
          </Suspense>
        </LoginDialogProvider>
      </body>
    </html>
  );
}
