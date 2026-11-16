import type { Metadata, Viewport } from 'next';
import { Outfit, Inter } from 'next/font/google';
import '@/app/globals.css';
import { IconSprite } from '@/components/ui/Icon';

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600'],
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'GROVIA — a people-ops dashboard with motion that behaves',
  description:
    'A warm bento HR dashboard: hiring rail, weekly progress, a live time tracker, onboarding tasks, a week calendar, people and payroll views — one GSAP load choreography and transform-only interactions.',
  openGraph: {
    type: 'website',
    title: 'GROVIA — a people-ops dashboard with motion that behaves',
    description: 'Overview, People and Payroll, arriving in one choreography.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#5ea86f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <a className="skip-link" href="#workspace-main">
          Skip to dashboard
        </a>
        <IconSprite />
        <main className="stage" id="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
