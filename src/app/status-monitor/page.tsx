import type { Metadata } from 'next';

import { ExchangeWatch } from '@/components/exchange-watch';

export const metadata: Metadata = {
  title: 'Exchange watch · Alpha',
};

export default function Page() {
  return <ExchangeWatch />;
}
