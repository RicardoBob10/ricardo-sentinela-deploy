
import { GoogleGenAI, Type } from "@google/genai";
import { Candle, Signal, MarketSide } from "../types";
import { sendTelegramMessage } from "./notificationService";

// Fix: Updated function signature to receive telegram credentials from the UI state
export const analyzeMarket = async (
  asset: string,
  candles: Candle[],
  timeframe: string,
  tgToken: string,
  tgChatId: string
): Promise<Signal | null> => {
  // Use named parameter as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const currentLocalTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const candleHistory = candles.map(c => 
    `T: ${c.time}, O: ${c.open}, H: ${c.high}, L: ${c.low}, C: ${c.close}`
  ).join('\n');

  const systemInstruction = `
    Especialista em Opções Binárias M15. 
    Analise Price Action + RSI. 
    Retorne apenas sinais com >75% de confiança.
    Horário Brasília: ${currentLocalTime}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Ativo: ${asset}, TF: ${timeframe}\nDados:\n${candleHistory}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            side: { type: Type.STRING, enum: ['BUY', 'SELL', 'NEUTRAL'] },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            price: { type: Type.NUMBER }
          },
          required: ['side', 'confidence', 'reasoning', 'price']
        }
      }
    });

    // Fix: Accessing .text as a property as per guidelines
    const result = JSON.parse(response.text || '{}');
    
    if (!result.side || result.side === 'NEUTRAL' || result.confidence <= 75) return null;

    const signal: Signal = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      asset,
      side: result.side as MarketSide,
      price: result.price || (candles.length > 0 ? candles[candles.length - 1].close : 0),
      timeframe,
      confidence: result.confidence,
      reasoning: result.reasoning
    };

    // Fix: Using the tokens passed from the component state
    sendTelegramMessage(tgToken, tgChatId, signal);

    return signal;
  } catch (error) {
    console.error("Gemini Service Error:", error);
    return null;
  }
};
