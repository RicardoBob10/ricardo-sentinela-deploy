import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória volátil - Protegida pela trava de tempo real na v108
let cacheSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO - VERSÃO 108
  const versao = "108";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "14:30"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const twelveDataKey = "e36e4f3a97124f5c9e2b1d3f5a7c9e1b";

  const agoraUnix = Date.now();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;

  // FETCHERS COM REDUNDÂNCIA (NC 89-01 E 89-02)
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
    const ativos = [{ label: "Bitcoin", data: await getBTC(), prec: 2 }, { label: "EURUSD", data: await getEUR(), prec: 5 }];

    for (const ativo of ativos) {
      if (!ativo.data || ativo.data.length < 30) continue;

      const i = ativo.data.length - 2; // Vela que acabou de fechar
      const vela = ativo.data[i];
      const dataVela = new Date(vela.t);
      const tempoVelaStr = dataVela.toLocaleTimeString('pt-BR', optionsTime);

      // --- FILTRO DE SINCRONISMO ABSOLUTO ---
      if (dataVela.getMinutes() % 15 !== 0) continue;

      // JANELA DE DISPARO: Se passar 40s do fechamento oficial, mata o sinal
      const fechamentoOficial = vela.t + (15 * 60 * 1000);
      const diffSegundos = (agoraUnix - fechamentoOficial) / 1000;
      if (diffSegundos > 40 || diffSegundos < -10) continue;

      // LÓGICA RT_ROBO_SCALPER_V3 (EMA 9/21)
      const calcEMA = (p: number) => {
        const k = 2 / (p + 1);
        let e = ativo.data[0].c;
        for (let j = 1; j <= i; j++) e = (ativo.data[j].c * k) + (e * (1 - k));
        return e;
      };
      const m9 = calcEMA(9), m21 = calcEMA(21);
      const call = m9 > m21; const put = m9 < m21;

      // TRAVA DE DUPLICIDADE
      const sinalId = `${ativo.label}_${vela.t}`;
      if ((call || put) && cacheSinais[ativo.label] !== sinalId) {
        cacheSinais[ativo.label] = sinalId;

        // CÁLCULO ATR PARA TAKE PROFIT E STOP LOSS
        let trSoma = 0;
        for (let j = i - 13; j <= i; j++) {
          const h = ativo.data[j].h; const l = ativo.data[j].l; const cp = ativo.data[j-1].c;
          trSoma += Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
        }
        const atr = trSoma / 14;
        const tpFinal = call ? (vela.c + (atr * 1.5)) : (vela.c - (atr * 1.5));
        const slFinal = call ? (vela.c - (atr * 2.0)) : (vela.c + (atr * 2.0));

        const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                    `<b>ATIVO:</b> ${ativo.label}\n` +
                    `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                    `<b>VELA:</b> ${tempoVelaStr}\n` +
                    `<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}\n` +
                    `<b>TP (ATR):</b> $ ${tpFinal.toFixed(ativo.prec)}\n` +
                    `<b>SL (ATR):</b> $ ${slFinal.toFixed(ativo.prec)}`;

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
