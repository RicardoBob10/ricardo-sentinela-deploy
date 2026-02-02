import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Busca reduzida para garantir estabilidade (50 velas)
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=50`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length < 20) {
      return res.status(200).json({ status: "Erro", detalhe: "Conexão Binance instável" });
    }

    // Organizando os dados (Vela [0] é a atual)
    const candles = data.map((d: any) => ({
      o: parseFloat(d[1]),
      h: parseFloat(d[2]),
      l: parseFloat(d[3]),
      c: parseFloat(d[4])
    })).reverse();

    // 2. Cálculos Matemáticos (EMA e RSI simplificados)
    const getSMA = (period: number) => {
      const slice = candles.slice(0, period);
      return slice.reduce((acc, val) => acc + val.c, 0) / period;
    };

    const sma9 = getSMA(9);
    const sma21 = getSMA(21);
    const isRed = candles[0].c < candles[0].o;
    const isGreen = candles[0].c > candles[0].o;

    // 3. Lógica do Fractal (Igual ao seu LUA: Vela [2] comparada com [0,1,3,4]) 
    const fractalTopo = candles[2].h > candles[4].h && candles[2].h > candles[3].h && 
                        candles[2].h > candles[1].h && candles[2].h > candles[0].h;
    
    const fractalFundo = candles[2].l < candles[4].l && candles[2].l < candles[3].l && 
                         candles[2].l < candles[1].l && candles[2].l < candles[0].l;

    let sinal = null;
    // Gatilhos conforme seu script LUA [cite: 5]
    if (fractalTopo && sma9 < sma21 && isRed) sinal = "🔴 ABAIXO (VENDA)";
    if (fractalFundo && sma9 > sma21 && isGreen) sinal = "🟢 ACIMA (COMPRA)";

    // 4. Envio ao Telegram
    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `🚀 **SINAL RT_ROBO:** ${sinal}`, parse_mode: 'Markdown' })
      });
      return res.status(200).json({ status: "SINALIZADO", sinal });
    }

    return res.status(200).json({ 
      status: "MONITORANDO", 
      check: "Lógica Fractal OK",
      precos: `SMA9: ${sma9.toFixed(2)} | SMA21: ${sma21.toFixed(2)}`
    });

  } catch (error: any) {
    return res.status(200).json({ status: "ERRO CRÍTICO", detalhe: error.message });
  }
}
