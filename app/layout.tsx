import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gemma Search",
  description: "Search with Gemma AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function getTheme() {
                  const savedTheme = localStorage.getItem('theme');
                  if (savedTheme === 'dark' || savedTheme === 'light') {
                    return savedTheme;
                  }
                  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }

                function applyTheme(theme) {
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                }

                applyTheme(getTheme());

                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                  const savedTheme = localStorage.getItem('theme');
                  if (!savedTheme) {
                    applyTheme(e.matches ? 'dark' : 'light');
                  }
                });
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
