import type { Metadata } from "next";
import "./site.css";
import { getOwnerUser } from '@/lib/owner-auth';
import {NavigationPrompts} from '@/components/navigation-prompts';
import {appearanceScript,AppearanceListener} from '@/components/appearance-settings';
import {PhotonShell} from '@/components/app-shell';
import { MobileSupport } from '@/components/mobile-support';

export const metadata: Metadata = {
  title: "Photon Energy Home",
  description: "Private solar, battery, grid and smart-home monitoring for a Photon hybrid system.",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user=await getOwnerUser();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>{process.env.NODE_ENV==='development'&&<script dangerouslySetInnerHTML={{__html:`if('serviceWorker' in navigator&&navigator.serviceWorker.controller){navigator.serviceWorker.getRegistrations().then(async registrations=>{for(const registration of registrations)if(registration.scope===location.origin+'/')await registration.unregister();location.reload();});}`}}/>}<script dangerouslySetInnerHTML={{__html:appearanceScript}}/>{user&&<meta name="photon-account" content={user.userId}/>}<meta name="theme-color" content="#09111f"/></head>
      <body className="antialiased"><AppearanceListener/><NavigationPrompts/><MobileSupport accountId={user?.userId??null}>{user?<PhotonShell>{children}</PhotonShell>:children}</MobileSupport></body>
    </html>
  );
}
