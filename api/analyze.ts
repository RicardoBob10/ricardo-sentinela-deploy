import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    const candles = result.data.map((v: any) => ({
      t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4])
    })).slice(0, 40);

    const getEMA = (p: number) => {
      const k = 2 / (p + 1);
      let val = candles[candles.length - 1].c;
      for (let i = candles.length - 2; i >= 0; i--) val = candles[i].c * k + val * (1 - k);
      return val;
    };

    const calculateRSI = (data: any[], period: number) => {
      let gains = 0, losses = 0;
      for (let i = data.length - period; i < data.length; i++) {
        const diff = data[i].c - data[i-1].c;
        if (diff >= 0) gains += diff; else losses -= diff;
      }
      return 100 - (100 / (1 + ((gains / period) / (losses / period))));
    };

    const rsiVal = calculateRSI(candles.reverse(), 14);
    const ema9 = getEMA(9);
    const ema21 = getEMA(21);
    const c = candles;

    // FRACTAL (Vela 2 é o extremo)
    const f_topo = c[2].h > c[4].h && c[2].h > c[3].h && c[2].h > c[1].h && c[2].h > c[0].h;
    const f_fundo = c[2].l < c[4].l && c[2].l < c[3].l && c[2].l < c[1].l && c[2].l < c[0].l;

    let sinalTexto = "";
    if (f_topo && ema9 < ema21 && rsiVal <= 48) sinalTexto = "🔴 ABAIXO"; 
    if (f_fundo && ema9 > ema21 && rsiVal >= 52) sinalTexto = "🟢 ACIMA";

    if (sinalTexto) {
      // Cálculo do Horário de Brasília
      const dataVela = new Date(c[0].t * 1000);
      const options: any = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' };
      const horaVela = dataVela.toLocaleTimeString('pt-BR', options);

      // Cálculo Expiração M15 (Próximo múltiplo de 15)
      const m = dataVela.getUTCMinutes();
      const expMin = Math.ceil((m + 1) / 15) * 15;
      dataVela.setUTCMinutes(expMin === 60 ? 0 : expMin);
      if (expMin === 60) dataVela.setUTCHours(dataVela.getUTCHours() + 1);
      const horaExp = dataVela.toLocaleTimeString('pt-BR', options);

      const mensagem = `**SINAL CONFIRMADO**\n**ATIVO**: BTCUSD\n**SINAL**: ${sinalTexto}\n**VELA**: ${horaExp}`;

      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: mensagem, parse_mode: 'Markdown' })
      });
    }

    return res.status(200).json({ status: "Sincronizado BR" });
  } catch (e) { return res.status(200).send("Erro"); }
}
