import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeInitScript, ThemeProvider } from '@/components/theme/ThemeProvider';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import { DriveTestProvider } from '@/context/DriveTestContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Cakra — Drive Test Intelligence',
  description:
    'Cakra — Telecom drive test analytics for RF engineers. LTE & 5G NR analysis from G-NetTrack Pro, TEMS, NEMO, and SIGMON.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider>
          <LanguageProvider>
            <DriveTestProvider>{children}</DriveTestProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
