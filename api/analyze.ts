import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória global para travar reincidências de sinais (NC 92-01 R1)
let cacheSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO - VERSÃO 96
  const versao = "96";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "11:25"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const twelveDataKey = "e36e4f3a97124f5c9e2b1d3f5a7c9e1b"; // Exemplo de chave

  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;

  // 1. BUSCA DE DADOS BITCOIN (KUCOIN PRINCIPAL / BYBIT BACKUP)
  async function getBTC() {
    const urls = [
      `https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min`,
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=50`
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const d = await res.json();
        const isKu = url.includes('kucoin');
        const raw = isKu ? d.data : d.result.list;
        return raw.map((v: any) => ({
          t: Number(v[0]), 
          c: parseFloat(v[4]), 
          h: parseFloat(v[2]), 
          l: parseFloat(v[3])
        })).sort((a:any, b:any) => a.t - b.t);
      } catch (e) { console.error("BTC API Down"); }
    }
    return null;
  }

  // 2. BUSCA DE DADOS EURUSD (TWELVE DATA PRINCIPAL / YAHOO BACKUP)
  async function getEUR() {
    try {
      const r1 = await fetch(`https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=50&apikey=${twelveDataKey}`);
      const d1 = await r1.json();
      if (d1.values) return d1.values.reverse().map((v: any) => ({
        t: new Date(v.datetime).getTime(), c: parseFloat(v.close), h: parseFloat(v.high), l: parseFloat(v.low)
      }));
      // Backup Yahoo
      const r2 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=15m&range=1d`);
      const d2 = await r2.json();
      const chart = d2.chart.result[0];
      return chart.timestamp.map((t: number, i: number) => ({
        t: t * 1000, c: chart.indicators.quote[0].close[i], h: chart.indicators.quote[0].high[i], l: chart.indicators.quote[0].low[i]
      }));
    } catch (e) { return null; }
  }

  try {
    const ativos = [
      { label: "Bitcoin", data: await getBTC(), prec: 2 },
      { label: "EURUSD", data: await getEUR(), prec: 5 }
    ];

    for (const ativo of ativos) {
      if (!ativo.data || ativo.data.length < 25) continue;

      // NC 91-01 R2 & 95-01: Pegamos a vela fechada (index length - 2)
      const i = ativo.data.length - 2;
      const vela = ativo.data[i];
      const dataVela = new Date(vela.t);
      const tempoVela = dataVela.toLocaleTimeString('pt-BR', optionsTime);

      // CORREÇÃO NC 91-02: Filtro rigoroso de 15 minutos
      if (dataVela.getMinutes() % 15 !== 0) continue;

      // Lógica RT_ROBO_SCALPER_V3 (EMA 9/21 + RSI)
      const calcEMA = (p: number) => {
        const k = 2 / (p + 1);
        let e = ativo.data[0].c;
        for (let j = 1; j <= i; j++) e = (ativo.data[j].c * k) + (e * (1 - k));
        return e;
      };
      const m9 = calcEMA(9), m21 = calcEMA(21);
      
      const call = m9 > m21; 
      const put = m9 < m21;

      // NC 92-01 R1: Trava de sinal para evitar spam na mesma vela
      const sinalId = `${ativo.label}_${tempoVela}`;
      if ((call || put) && cacheSinais[ativo.label] !== sinalId) {
        cacheSinais[ativo.label] = sinalId;

        const h20 = Math.max(...ativo.data.slice(i-20, i+1).map((v:any) => v.h));
        const l20 = Math.min(...ativo.data.slice(i-20, i+1).map((v:any) => v.l));

        const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                    `<b>ATIVO:</b> ${ativo.label}\n` +
                    `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                    `<b>VELA:</b> ${tempoVela}\n` +
                    `<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}\n` +
                    `<b>TP:</b> $ ${call ? h20.toFixed(ativo.prec) : l20.toFixed(ativo.prec)}\n` +
                    `<b>SL:</b> $ ${call ? l20.toFixed(ativo.prec) : h20.toFixed(ativo.prec)}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
        });
      }
    }
  } catch (e) { console.error("Erro Processamento"); }

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
