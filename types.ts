
export enum MarketSide {
  BUY = 'BUY',
  SELL = 'SELL',
  NEUTRAL = 'NEUTRAL'
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1D';

export interface Candle {
  time: number; // Unix timestamp for lightweight charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  id: string;
  timestamp: Date;
  asset: string;
  side: MarketSide;
  price: number;
  timeframe: string;
  confidence: number;
  reasoning: string;
}

export interface TraderConfig {
  telegramBotToken: string;
  telegramChatId: string;
  active: boolean;
  intervalMinutes: number;
  timeframe: Timeframe;
}
