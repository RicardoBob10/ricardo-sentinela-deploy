import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória global para evitar reincidências (NC 92-01 R1)
let cacheSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO - VERSÃO 95
  const versao = "95";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "11:05"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const twelveDataKey = "SUA_CHAVE_AQUI"; // Inserir chave gratuita Twelve Data

  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const agora = new Date();
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);

  // BUSCA BITCOIN (KUCOIN PRINCIPAL / BYBIT BACKUP) - NC 89-01
  async function getBTC() {
    const providers = [
      { n: 'Kucoin', u: `https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min` },
      { n: 'Bybit', u: `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15` }
    ];
    for (const p of providers) {
      try {
        const r = await fetch(p.u, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) continue;
        const d = await r.json();
        const raw = p.n === 'Kucoin' ? d.data : d.result.list;
        return raw.map((v: any) => [Number(v[0]), parseFloat(v[4]), parseFloat(v[2]), parseFloat(v[3])]).sort((a:any, b:any) => a[0] - b[0]);
      } catch (e) { console.warn(`BTC Provider ${p.n} falhou.`); }
    }
    return null;
  }

  // BUSCA EURUSD (TWELVE DATA PRINCIPAL / YAHOO BACKUP) - NC 89-02
  async function getEUR() {
    try {
      const r1 = await fetch(`https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=50&apikey=${twelveDataKey}`);
      const d1 = await r1.json();
      if (d1.values) return d1.values.reverse().map((v: any) => [new Date(v.datetime).getTime(), parseFloat(v.close), parseFloat(v.high), parseFloat(v.low)]);
      
      const r2 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=15m&range=1d`);
      const d2 = await r2.json();
      const res = d2.chart.result[0];
      return res.timestamp.map((t: number, i: number) => [t * 1000, res.indicators.quote[0].close[i], res.indicators.quote[0].high[i], res.indicators.quote[0].low[i]]);
    } catch (e) { return null; }
  }

  try {
    const dadosBTC = await getBTC();
    const dadosEUR = await getEUR();

    const ativos = [
      { label: "Bitcoin", data: dadosBTC, prec: 2 },
      { label: "EURUSD", data: dadosEUR, prec: 5 }
    ];

    for (const ativo of ativos) {
      if (!ativo.data || ativo.data.length < 25) continue;

      // NC 91-01 R2: Sincronismo com a Bullex usando a vela fechada (index -2)
      const i = ativo.data.length - 2;
      const tsVela = ativo.data[i][0];
      const precoF = ativo.data[i][1];
      const tempoVela = new Date(tsVela).toLocaleTimeString('pt-BR', optionsTime);

      // Trava de Horário: Apenas 00, 15, 30, 45 (Elimina 03:47, 09:29)
      if (new Date(tsVela).getMinutes() % 15 !== 0) continue;

      // Lógica EMA + RSI
      const calcEMA = (p: number) => {
        const k = 2 / (p + 1);
        let e = ativo.data[0][1];
        for (let j = 1; j <= i; j++) e = (ativo.data[j][1] * k) + (e * (1 - k));
        return e;
      };
      const m9 = calcEMA(9), m21 = calcEMA(21);
      
      const call = m9 > m21; 
      const put = m9 < m21;

      // NC 92-01 R1: Trava de ID Único (Ativo + Hora) para evitar spam
      const sinalId = `${ativo.label}_${tempoVela}`;
      if ((call || put) && cacheSinais[ativo.label] !== sinalId) {
        cacheSinais[ativo.label] = sinalId;

        const h20 = Math.max(...ativo.data.slice(i-20, i+1).map(v => v[2]));
        const l20 = Math.min(...ativo.data.slice(i-20, i+1).map(v => v[3]));

        const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                    `<b>ATIVO:</b> ${ativo.label}\n` +
                    `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                    `<b>VELA:</b> ${tempoVela}\n` +
                    `<b>PREÇO:</b> $ ${precoF.toFixed(ativo.prec)}\n` +
                    `<b>TP:</b> $ ${call ? h20.toFixed(ativo.prec) : l20.toFixed(ativo.prec)}\n` +
                    `<b>SL:</b> $ ${call ? l20.toFixed(ativo.prec) : h20.toFixed(ativo.prec)}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
        });
      }
    }
  } catch (e) { console.error("Erro no Processamento"); }

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
