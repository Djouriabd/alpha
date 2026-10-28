import type { Metadata, Viewport } from 'next';
import { Baloo_2 } from 'next/font/google';

import { AlphaProvider } from '@/components/alpha-provider';
import './globals.css';

const baloo = Baloo_2({
  variable: '--font-baloo',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Alpha',
  description: 'Your Alpha Prime average and exchange health, tracked live.',
};

export const viewport: Viewport = {
  themeColor: '#090F15',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={baloo.variable}>
      <body>
        <AlphaProvider>{children}</AlphaProvider>
      </body>
    </html>
  );
}
