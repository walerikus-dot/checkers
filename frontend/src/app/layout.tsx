import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import Nav from '../components/Nav';

export const metadata: Metadata = {
  title: 'Checkers Online',
  description: 'Play checkers online with friends or AI opponents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white min-h-screen">
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
