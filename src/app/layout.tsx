import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { PresenceProvider } from "@/context/PresenceProvider";
import { FriendsProvider } from "@/context/FriendsProvider";
import { ToastProvider } from "@/context/ToastContext";
import { InvitationsProvider } from "@/context/InvitationsProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GeoArena - Explore the World",
  description: "A geography guessing game. Explore Street View and guess where you are!",
};

// viewport-fit: cover lets us use env(safe-area-inset-*) so the HUD / fixed
// buttons clear notches and home bars on phones. themeColor matches the bg.
export const viewport: Viewport = {
  themeColor: "#0e0b1e",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head />
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ToastProvider>
            <PresenceProvider>
              <FriendsProvider>
                <InvitationsProvider>{children}</InvitationsProvider>
              </FriendsProvider>
            </PresenceProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
