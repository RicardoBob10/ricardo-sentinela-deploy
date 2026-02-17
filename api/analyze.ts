import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória para travar reincidências e spam de velas (NC 92-01 R1)
let cacheSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const versao = "93";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "11:15"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const agora = new Date();
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);
  const diaSemana = agora.getDay();
  const horaMinutoInt = parseInt(horaAtualHHMM.replace(':', ''));

  // ITEM 6: GESTÃO DE HORÁRIOS
  const statusEUR = (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && horaMinutoInt <= 1900) || (diaSemana === 0 && horaMinutoInt >= 1901) ? "ABERTO" : "FECHADO";

  async function fetchCandles(symbol: string) {
    const apis = [
      { n: 'Binance', u: `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=50` },
      { n: 'Bybit', u: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=15&limit=50` }
    ];
    for (const api of apis) {
      try {
        const r = await fetch(api.u, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) continue;
        const d = await r.json();
        const raw = api.n === 'Binance' ? d : d.result.list;
        return raw.map((v: any) => [Number(v[0]), parseFloat(v[4]), parseFloat(v[2]), parseFloat(v[3])]).sort((a:any, b:any) => a[0] - b[0]);
      } catch (e) { console.error(`Erro API ${api.n}`); }
    }
    return null;
  }

  try {
    const ativos = [
      { symbol: "BTCUSDT", label: "Bitcoin", prec: 2, operando: true },
      { symbol: "EURUSDT", label: "EURUSD", prec: 5, operando: statusEUR === "ABERTO" }
    ];

    for (const ativo of ativos) {
      if (!ativo.operando) continue;

      const candles = await fetchCandles(ativo.symbol);
      if (!candles || candles.length < 20) continue;

      // --- CORREÇÃO NC 91-01 R2 e 92-01 R1 ---
      // Pegamos a penúltima vela (index -2), que é a vela que a Bullex acabou de fechar.
      const i = candles.length - 2; 
      const candleFechado = candles[i];
      const tsVela = candleFechado[0];
      const precoFechamento = candleFechado[1];
      
      const dataVela = new Date(tsVela);
      const tempoVelaStr = dataVela.toLocaleTimeString('pt-BR', optionsTime);

      // Trava: O robô só processa se a vela for múltiplo de 15 min (00, 15, 30, 45)
      if (dataVela.getMinutes() % 15 !== 0) continue;

      // Lógica EMA 9/21 + RSI 14
      const calcEMA = (p: number) => {
        const k = 2 / (p + 1);
        let e = candles[0][1];
        for (let j = 1; j <= i; j++) e = (candles[j][1] * k) + (e * (1 - k));
        return e;
      };

      const m9 = calcEMA(9);
      const m21 = calcEMA(21);
      
      let g = 0, l = 0;
      for (let j = i - 14; j < i; j++) {
        const diff = candles[j+1][1] - candles[j][1];
        diff >= 0 ? g += diff : l += Math.abs(diff);
      }
      const rsi = 100 - (100 / (1 + (g / (l || 1))));

      const call = m9 > m21 && rsi > 50;
      const put = m9 < m21 && rsi < 50;

      // --- TRAVA DEFINITIVA DE REPETIÇÃO ---
      const sinalId = `${ativo.label}_${tsVela}`;
      if ((call || put) && cacheSinais[ativo.label] !== sinalId) {
        cacheSinais[ativo.label] = sinalId;

        const h20 = Math.max(...candles.slice(i-20, i+1).map((v:any) => v[2]));
        const l20 = Math.min(...candles.slice(i-20, i+1).map((v:any) => v[3]));

        const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                    `<b>ATIVO:</b> ${ativo.label}\n` +
                    `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                    `<b>VELA:</b> ${tempoVelaStr}\n` + // Cumpre NC 91-02
                    `<b>PREÇO:</b> $ ${precoFechamento.toFixed(ativo.prec)}\n` +
                    `<b>TP:</b> $ ${call ? h20.toFixed(ativo.prec) : l20.toFixed(ativo.prec)}\n` +
                    `<b>SL:</b> $ ${call ? l20.toFixed(ativo.prec) : h20.toFixed(ativo.prec)}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
        });
      }
    }
  } catch (e) { console.error("Erro Ciclo"); }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <html><body style="font-family:sans-serif;padding:40px;">
      <b>RICARDO SENTINELA BOT - V${versao}</b><br>
      STATUS: <span style="color:green">ATIVADO</span><br>
      DATA/HORA REVISÃO: ${dataRevisao} ${horaRevisao}<br>
      MERCADO EURUSD: ${statusEUR}
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body></html>
  `);
}
