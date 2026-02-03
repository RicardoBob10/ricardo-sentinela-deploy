import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // Voltando para o timeframe de 1 minuto estável
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    
    if (result.code !== "200000" || !result.data) return res.status(200).json({ status: "Erro na API" });

    const c = result.data.map((d: any) => ({
      o: parseFloat(d[1]), c: parseFloat(d[2]), h: parseFloat(d[3]), l: parseFloat(d[4])
    })).slice(0, 30);

    // --- CÁLCULOS DAS EMAs E RSI (IGUAL AO SCRIPT LUA) ---
    const getEMA = (data: any[], p: number) => {
        const k = 2 / (p + 1);
        let ema = data[data.length - 1].c;
        for (let i = data.length - 2; i >= 0; i--) ema = data[i].c * k + ema * (1 - k);
        return ema;
    };

    const ema9 = getEMA(c, 9);
    const ema21 = getEMA(c, 21);

    // --- LÓGICA DO FRACTAL (GATILHO NA VELA 2) ---
    const fractal_topo = c[2].h > c[4].h && c[2].h > c[3].h && c[2].h > c[1].h && c[2].h > c[0].h;
    const fractal_fundo = c[2].l < c[4].l && c[2].l < c[3].l && c[2].l < c[1].l && c[2].l < c[0].l;

    let sinal = null;

    // VENDA (ABAIXO)
    if (fractal_topo && (ema9 < ema21)) {
        sinal = `🔴 **SINAL DE VENDA (ABAIXO)**\n📈 TF: 1 Minuto\n📊 Médias: 9 abaixo da 21`;
    }

    // COMPRA (ACIMA)
    if (fractal_fundo && (ema9 > ema21)) {
        sinal = `🟢 **SINAL DE COMPRA (ACIMA)**\n📈 TF: 1 Minuto\n📊 Médias: 9 acima da 21`;
    }

    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: TG_CHAT_ID, 
          text: `💎 **RT_ROBO M1:**\n${sinal}`, 
          parse_mode: 'Markdown' 
        })
      });
      return res.status(200).json({ status: "SINAL ENVIADO", sinal });
    }

    return res.status(200).json({ 
      status: "VARRENDO M1", 
      ema9: ema9.toFixed(2), 
      ema21: ema21.toFixed(2) 
    });

  } catch (error) { 
    return res.status(200).json({ status: "Erro Conexão" }); 
  }
}
