import type { Metadata } from "next";
import { Rajdhani, Orbitron, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Body text: a technical, slightly condensed sans that still reads well at
// small sizes for labels and copy.
const body = Rajdhani({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Headings / panel titles / nav labels: a geometric, wide-tracked display
// face — the single biggest lever for the "sci-fi HUD" read.
const display = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Numeric readouts (watts, %, kWh, clock) — tabular figures, monospace.
const readout = JetBrains_Mono({
  variable: "--font-readout",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Solar Dashboard",
  description: "Live monitoring for the home solar, battery, and Tuya devices.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${readout.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
