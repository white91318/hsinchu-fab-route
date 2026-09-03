import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  variable: "--font-display",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-sans",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "竹科塞車通",
  description: "給新竹科學園區通勤族的路況決策工具:今天走哪條路、哪裡在施工、大廠什麼時候交接班。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${bigShoulders.variable} ${notoSansTC.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
