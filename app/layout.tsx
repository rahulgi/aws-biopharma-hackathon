import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Slipstream — pharma evidence repackaging",
  description:
    "Traceable pharmaceutical content planning for Medical Affairs, MSL, and Sales teams.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
