export type ExchangeEndpoint = {
  id: string;
  name: string;
  shortName: string;
  url: string;
  /** Official alternative domains tried when `url` is geo-blocked (HTTP 403 or 451) from the server's region. */
  fallbackUrls?: string[];
};

export const EXCHANGE_ENDPOINTS: ExchangeEndpoint[] = [
  {
    id: 'okx',
    name: 'OKX',
    shortName: 'OK',
    url: 'https://www.okx.com/api/v5/system/status',
  },
  {
    id: 'binance',
    name: 'Binance',
    shortName: 'BN',
    url: 'https://api.binance.com/sapi/v1/system/status',
    // Binance's public market-data domain, which is not subject to the US block on api.binance.com.
    fallbackUrls: ['https://data-api.binance.vision/api/v3/ping'],
  },
  {
    id: 'bybit',
    name: 'Bybit',
    shortName: 'BY',
    url: 'https://api.bybit.com/v5/market/time',
    fallbackUrls: ['https://api.bytick.com/v5/market/time'],
  },
  {
    id: 'kucoin',
    name: 'KuCoin',
    shortName: 'KC',
    url: 'https://api.kucoin.com/api/v1/status',
  },
  {
    id: 'mexc',
    name: 'MEXC',
    shortName: 'MX',
    url: 'https://api.mexc.com/api/v3/ping',
  },
  {
    id: 'gateio',
    name: 'Gate.io',
    shortName: 'GT',
    url: 'https://api.gateio.ws/api/v4/spot/time',
  },
];

export const EXCHANGE_INTERVAL_OPTIONS = [30, 60, 300, 900] as const;
