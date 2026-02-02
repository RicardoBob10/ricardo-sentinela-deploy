import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Rota de Fuga: Usando KuCoin (Não bloqueia Vercel como a Binance)
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min`);
    const result = await response.json();
    
    if (result.code !== "200000" || !result.data) {
      return res.status(200).json({ status: "Aguardando", info: "Sincronizando mercado..." });
    }

    // KuCoin retorna: [tempo, abertura, fechamento, maxima, minima, volume, ...]
    const c = result.data.map((d: any) => ({
      o: parseFloat(d[1]), c: parseFloat(d[2]), h: parseFloat(d[3]), l: parseFloat(d[4])
    })).slice(0, 10); // Pegamos as últimas 10 velas

    // 2. Lógica do Fractal de 5 Velas (Alinhado com seu LUA)
    // Vela [2] é a central. Comparamos com [0, 1, 3, 4]
    const fractalTopo = c[2].h > c[0].h && c[2].h > c[1].h && c[2].h > c[3].h && c[2].h > c[4].h;
    const fractalFundo = c[2].l < c[0].l && c[2].l < c[1].l && c[2].l < c[3].l && c[2].l < c[4].l;

    // 3. Filtro de Cor da Vela Atual [0]
    const isRed = c[0].c < c[0].o;
    const isGreen = c[0].c > c[0].o;

    let sinal = null;
    if (fractalTopo && isRed) sinal = "🔴 ABAIXO (VENDA)";
    if (fractalFundo && isGreen) sinal = "🟢 ACIMA (COMPRA)";

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
      status: "CONECTADO (VIA BACKUP)", 
      info: "Monitorando Fractal + Cor",
      last_price: c[0].c
    });

  } catch (error: any) {
    return res.status(200).json({ status: "Erro", info: "Tentando reconectar..." });
  }
}
