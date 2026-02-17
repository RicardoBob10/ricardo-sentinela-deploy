import { VercelRequest, VercelResponse } from '@vercel/node';

let cacheSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const versao = "103";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "13:15"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const twelveDataKey = "e36e4f3a97124f5c9e2b1d3f5a7c9e1b";

  const agora = new Date();
  const agoraUnix = agora.getTime();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;

  // FETCHERS (REDUNDÂNCIA ATIVA)
  async function getBTC() {
    const urls = [`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min`, `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=50` ];
    for (const u of urls) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(3500) });
        const d = await res.json();
        const raw = u.includes('kucoin') ? d.data : d.result.list;
        return raw.map((v: any) => ({ t: Number(v[0]), c: parseFloat(v[4]), h: parseFloat(v[2]), l: parseFloat(v[3]) })).sort((a:any, b:any) => a.t - b.t);
      } catch (e) { }
    }
    return null;
  }

  async function getEUR() {
    try {
      const r1 = await fetch(`https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=50&apikey=${twelveDataKey}`);
      const d1 = await r1.json();
      if (d1.values) return d1.values.reverse().map((v: any) => ({ t: new Date(v.datetime).getTime(), c: parseFloat(v.close), h: parseFloat(v.high), l: parseFloat(v.low) }));
      const r2 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=15m&range=1d`);
      const d2 = await r2.json();
      const chart = d2.chart.result[0];
      return chart.timestamp.map((t: number, i: number) => ({ t: t * 1000, c: chart.indicators.quote[0].close[i], h: chart.indicators.quote[0].high[i], l: chart.indicators.quote[0].low[i] }));
    } catch (e) { return null; }
  }

  try {
    const ativos = [
      { label: "Bitcoin", data: await getBTC(), prec: 2 },
      { label: "EURUSD", data: await getEUR(), prec: 5 }
    ];

    for (const ativo of ativos) {
      if (!ativo.data || ativo.data.length < 30) continue;

      const i = ativo.data.length - 2; 
      const vela = ativo.data[i];
      
      // --- TRAVA DE OURO V103: JANELA DE 30 SEGUNDOS ---
      // A vela de 12:15 fecha às 12:30:00. O robô SÓ pode disparar entre 12:30:00 e 12:30:30.
      const fechamentoVelaUnix = vela.t + (15 * 60 * 1000);
      const atrasoEmSegundos = (agoraUnix - fechamentoVelaUnix) / 1000;

      // Se o robô detectar que a vela fechou há mais de 30 segundos, ele aborta.
      // Isso impede sinais como o das "12:29" para velas antigas.
      if (atrasoEmSegundos > 30 || atrasoEmSegundos < -10) continue;

      const tempoVelaStr = new Date(vela.t).toLocaleTimeString('pt-BR', optionsTime);

      // Filtro rigoroso de ciclo Bullex
      if (new Date(vela.t).getMinutes() % 15 !== 0) continue;

      // Cálculo ATR (14p)
      let trSoma = 0;
      for (let j = i - 13; j <= i; j++) {
        const h = ativo.data[j].h; const l = ativo.data[j].l; const cp = ativo.data[j-1].c;
        trSoma += Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
      }
      const atr = trSoma / 14;

      const calcEMA = (p: number) => {
        const k = 2 / (p + 1);
        let e = ativo.data[0].c;
        for (let j = 1; j <= i; j++) e = (ativo.data[j].c * k) + (e * (1 - k));
        return e;
      };
      const m9 = calcEMA(9), m21 = calcEMA(21);
      const call = m9 > m21; const put = m9 < m21;

      const sinalId = `${ativo.label}_${vela.t}`;
      if ((call || put) && cacheSinais[ativo.label] !== sinalId) {
        cacheSinais[ativo.label] = sinalId;

        const tpFinal = call ? (vela.c + (atr * 1.5)) : (vela.c - (atr * 1.5));
        const slFinal = call ? (vela.c - (atr * 2.0)) : (vela.c + (atr * 2.0));

        const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                    `<b>ATIVO:</b> ${ativo.label}\n` +
                    `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                    `<b>VELA:</b> ${tempoVelaStr}\n` +
                    `<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}\n` +
                    `<b>TP:</b> $ ${tpFinal.toFixed(ativo.prec)}\n` +
                    `<b>SL:</b> $ ${slFinal.toFixed(ativo.prec)}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
        });
      }
    }
  } catch (e) { }

  // INTERFACE HTML - REGRA DE OURO
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        body { background-color: #ffffff; color: #000000; font-family: sans-serif; padding: 40px; line-height: 1.5; }
        p { margin: 10px 0; font-size: 16px; }
        b { font-weight: bold; }
        .verde { color: #008000; font-weight: bold; }
      </style>
    </head>
    <body>
      <div>_________________________________________________________________</div>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p>&nbsp;</p>
      <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
      <p>&nbsp;</p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <div>__________________________________________________________________</div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
