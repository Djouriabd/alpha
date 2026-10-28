export type SessionInfo = {
  email: string;
  userName: string;
};

export type LoginResponseBody =
  | { kind: 'success'; session: SessionInfo }
  | { kind: 'two-factor'; message: string }
  | { kind: 'error'; message: string };

export type SnapshotResponseBody =
  | { kind: 'ok'; avgPercentToday: number; capturedAt: string }
  | { kind: 'expired'; message: string }
  | { kind: 'error'; message: string };

export type TrackingEvent = {
  id: string;
  type: 'increase' | 'decrease' | 'session';
  title: string;
  message: string;
  createdAt: string;
  previousValue?: number;
  currentValue?: number;
};

export type ExchangeMonitorConfig = {
  enabled: boolean;
  intervalSeconds: number;
};

export type ExchangeMonitorState =
  | 'checking'
  | 'healthy'
  | 'timeout'
  | 'bad-gateway'
  | 'unavailable'
  | 'blocked'
  | 'error';

export type ExchangeSnapshot = {
  endpointId: string;
  checkedAt: string;
  state: ExchangeMonitorState;
  httpStatus?: number;
  latencyMs?: number;
  observedStatus?: string;
  /** Set when a fallback domain answered instead of the main URL. */
  checkedUrl?: string;
};

export type ExchangeAlertEvent = {
  id: string;
  endpointId: string;
  exchangeName: string;
  type: 'timeout' | 'http-502' | 'http-503' | 'status-change';
  title: string;
  message: string;
  createdAt: string;
  previousStatus?: string;
  currentStatus?: string;
};

export type ExchangeCheckResponseBody = {
  snapshots: ExchangeSnapshot[];
  checkedAt: string;
};
