import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/themes";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import NextTopLoader from "nextjs-toploader";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unifero",
  description: "Next Gen Web Search Chatbot",
  icons: {
    icon: "/unifero.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: [shadcn],
        variables: {
          colorPrimary: "#6366f1",
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistMono.variable} ${manrope.variable} antialiased font-sans`}
        >
          <NextTopLoader
          color="#6366f1"
          height={5}
          zIndex={1600}
          easing="ease"
          initialPosition={0.4}
          crawlSpeed={500}
          crawl={true}
          showSpinner={false}
          speed={500}
        />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              {children}
              <Toaster style={{}} />
            </QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
