import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória de estado para travar spam de velas (NC 92-01 R1)
let cacheSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const versao = "94";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "11:20"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const twelveDataKey = "SUA_CHAVE_AQUI"; // Inserir sua chave gratuita aqui

  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const agora = new Date();
  const horaSistema = agora.toLocaleTimeString('pt-BR', optionsTime);

  // REDUNDÂNCIA PARA BITCOIN (KUCOIN PRINCIPAL / BYBIT BACKUP)
  async function getBTCData() {
    const apis = [
      { n: 'Kucoin', u: `https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min` },
      { n: 'Bybit', u: `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15` }
    ];
    for (const api of apis) {
      try {
        const r = await fetch(api.u, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) continue;
        const d = await r.json();
        const raw = api.n === 'Kucoin' ? d.data : d.result.list;
        // Normaliza para [timestamp, close, high, low]
        return raw.map((v: any) => [Number(v[0]), parseFloat(v[4]), parseFloat(v[2]), parseFloat(v[3])]).sort((a:any, b:any) => a[0] - b[0]);
      } catch (e) { console.warn(`BTC: ${api.n} falhou.`); }
    }
    return null;
  }

  // REDUNDÂNCIA PARA EURUSD (TWELVE DATA PRINCIPAL / YAHOO BACKUP)
  async function getEURData() {
    try {
      // 1. Twelve Data (Principal)
      const r1 = await fetch(`https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=50&apikey=${twelveDataKey}`);
      const d1 = await r1.json();
      if (d1.values) {
        return d1.values.reverse().map((v: any) => ({
          t: new Date(v.datetime).getTime(),
          c: parseFloat(v.close),
          h: parseFloat(v.high),
          l: parseFloat(v.low),
          hora: v.datetime.split(' ')[1].substring(0, 5)
        }));
      }
      // 2. Yahoo Finance (Backup - via query simples)
      const r2 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=15m&range=1d`);
      const d2 = await r2.json();
      const res = d2.chart.result[0];
      return res.timestamp.map((t: number, i: number) => ({
        t: t * 1000,
        c: res.indicators.quote[0].close[i],
        h: res.indicators.quote[0].high[i],
        l: res.indicators.quote[0].low[i],
        hora: new Date(t * 1000).toLocaleTimeString('pt-BR', optionsTime)
      }));
    } catch (e) { return null; }
  }

  try {
    // PROCESSAMENTO BITCOIN
    const btc = await getBTCData();
    if (btc) {
      const i = btc.length - 2; // Vela fechada
      const tempoVela = new Date(btc[i][0]).toLocaleTimeString('pt-BR', optionsTime);
      await processarAtivo("Bitcoin", btc, i, tempoVela, 2);
    }

    // PROCESSAMENTO EURUSD
    const eur = await getEURData();
    if (eur) {
      const i = eur.length - 2; // Vela fechada
      const b = eur.map((v:any) => [v.t, v.c, v.h, v.l]);
      await processarAtivo("EURUSD", b, i, eur[i].hora, 5);
    }

  } catch (e) { console.error("Erro Ciclo v94"); }

  async function processarAtivo(label: string, dados: any[], idx: number, tempoVela: string, prec: number) {
    // Bloqueio de horário quebrado (NC 91-01 R2) - Apenas minutos 00, 15, 30, 45
    const mins = parseInt(tempoVela.split(':')[1]);
    if (mins % 15 !== 0) return;

    // Lógica EMA 9/21 + RSI
    const ema = (p: number) => {
      const k = 2 / (p + 1);
      let e = dados[0][1];
      for (let j = 1; j <= idx; j++) e = (dados[j][1] * k) + (e * (1 - k));
      return e;
    };
    const m9 = ema(9), m21 = ema(21);
    
    const call = m9 > m21; // Simplificado para exemplo, manter sua lógica de RSI aqui
    const put = m9 < m21;

    const sinalId = `${label}_${tempoVela}`;
    if ((call || put) && cacheSinais[label] !== sinalId) {
      cacheSinais[label] = sinalId;

      const h20 = Math.max(...dados.slice(idx-20, idx+1).map(v => v[2]));
      const l20 = Math.min(...dados.slice(idx-20, idx+1).map(v => v[3]));

      const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                  `<b>ATIVO:</b> ${label}\n` +
                  `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                  `<b>VELA:</b> ${tempoVela}\n` +
                  `<b>PREÇO:</b> $ ${dados[idx][1].toFixed(prec)}\n` +
                  `<b>TP:</b> $ ${call ? h20.toFixed(prec) : l20.toFixed(prec)}\n` +
                  `<b>SL:</b> $ ${call ? l20.toFixed(prec) : h20.toFixed(prec)}`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
      });
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <html><body style="font-family:sans-serif;padding:40px;">
      <b>RICARDO SENTINELA BOT - V${versao}</b><br>
      CONFIG: EURUSD(Twelve/Yahoo) | BTC(Kucoin/Bybit)<br>
      STATUS: <span style="color:green">Sincronizado</span><br>
      HORA SISTEMA: ${horaSistema}
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body></html>
  `);
}
