import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Busca de dados via KuCoin (Backup estável)
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    
    if (result.code !== "200000" || !result.data) {
      return res.status(200).json({ status: "Erro", detalhe: "Sincronizando mercado..." });
    }

    // Mapeamento: [0]=Atual, [1]=Fechada... (KuCoin: 1=Open, 2=Close, 3=High, 4=Low)
    const c = result.data.map((d: any) => ({
      o: parseFloat(d[1]), c: parseFloat(d[2]), h: parseFloat(d[3]), l: parseFloat(d[4])
    })).slice(0, 30); // 30 velas para cálculo de Médias

    // 2. Cálculos de Médias (EMA) e RSI conforme seu LUA [cite: 1]
    const getEMA = (period: number) => {
        const k = 2 / (period + 1);
        let ema = c[c.length - 1].c;
        for (let i = c.length - 2; i >= 0; i--) {
            ema = c[i].c * k + ema * (1 - k);
        }
        return ema;
    };

    const getRSI = (period: number) => {
        let gains = 0, losses = 0;
        for (let i = 0; i < period; i++) {
            const diff = c[i].c - c[i+1].c;
            diff > 0 ? gains += diff : losses -= diff;
        }
        const rs = (gains / period) / (Math.abs(losses) / period);
        return 100 - (100 / (1 + rs));
    };

    const ema9 = getEMA(9);
    const ema21 = getEMA(21);
    const rsiVal = getRSI(14);

    // 3. Lógica do Fractal + Cor 
    const fractalTopo = c[1].h > c[0].h && c[1].h > c[2].h;
    const fractalFundo = c[1].l < c[0].l && c[1].l < c[2].l;
    const velaVermelha = c[0].c < c[0].o; // [cite: 1]
    const velaVerde = c[0].c > c[0].o;    // [cite: 1]

    let sinal = null;

    // CONDICAO ABAIXO (VENDA) 
    if (fractalTopo && (ema9 < ema21) && (rsiVal <= 45) && velaVermelha) {
        sinal = `🔴 **SINAL DE VENDA (ABAIXO)**\n📈 RSI: ${rsiVal.toFixed(2)}\n📊 Médias: 9 abaixo da 21`;
    }

    // CONDICAO ACIMA (COMPRA) 
    if (fractalFundo && (ema9 > ema21) && (rsiVal >= 55) && velaVerde) {
        sinal = `🟢 **SINAL DE COMPRA (ACIMA)**\n📈 RSI: ${rsiVal.toFixed(2)}\n📊 Médias: 9 acima da 21`;
    }

    // 4. Envio ao Telegram se todos os filtros baterem
    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `🚀 **RT_ROBO FINAL:**\n${sinal}`, parse_mode: 'Markdown' })
      });
      return res.status(200).json({ status: "SINAL FILTRADO ENVIADO", rsi: rsiVal.toFixed(2) });
    }

    return res.status(200).json({ 
      status: "FILTRANDO SINAIS", 
      rsi: rsiVal.toFixed(2), 
      ema9: ema9.toFixed(2), 
      ema21: ema21.toFixed(2) 
    });

  } catch (error: any) {
    return res.status(200).json({ status: "Erro", info: error.message });
  }
}
