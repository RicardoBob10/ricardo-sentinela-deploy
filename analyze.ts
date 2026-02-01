
import { GoogleGenAI, Type } from "@google/genai";

const TG_TOKEN = "8223429851:AAGrFgPQSg5CE2cWGLkr_qMMoW0LNbAzPMM";
const TG_CHAT_ID = "7625668696";
const ASSETS = [
  { name: 'BTC/USD', symbol: 'BTCUSDT', type: 'crypto' },
  { name: 'EUR/USD', symbol: 'EUR', type: 'forex' }
];

async function fetchBinanceData(symbol: string) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=20`);
    const data = await response.json();
    return data.map((d: any) => ({
      time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
    }));
  } catch (e) {
    return [];
  }
}

async function fetchEurData() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
    const data = await response.json();
    const spot = data.rates.USD;
    return Array.from({ length: 10 }, () => ({ close: spot }));
  } catch (e) {
    return [];
  }
}

async function sendTelegram(message: string) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message })
  });
}

export default async function handler(req: any, res: any) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing API_KEY" });

  const ai = new GoogleGenAI({ apiKey });
  const results = [];

  for (const asset of ASSETS) {
    const history = asset.type === 'crypto' ? await fetchBinanceData(asset.symbol) : await fetchEurData();
    if (history.length === 0) continue;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analise ${asset.name} M15: ${JSON.stringify(history.slice(-10))}.`,
      config: {
        systemInstruction: "Trader Pro. Retorne JSON: {side: 'BUY'|'SELL'|'NEUTRAL', confidence: number, reasoning: string, price: number}. Apenas confiança > 85%.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            side: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            price: { type: Type.NUMBER }
          },
          required: ['side', 'confidence', 'reasoning', 'price']
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    if (result.side !== 'NEUTRAL' && result.confidence >= 85) {
      const icon = result.side === 'BUY' ? '🟢 CALL' : '🔴 PUT';
      await sendTelegram(`🚀 SINAL ${asset.name}\n📈 AÇÃO: ${icon}\n🎯 PREÇO: ${result.price}\n⏱️ M15\nℹ️: ${result.reasoning}`);
      results.push({ asset: asset.name, signal: 'SENT' });
    }
  }

  res.status(200).json({ status: 'done', results });
}
