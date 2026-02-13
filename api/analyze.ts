import { VercelRequest, VercelResponse } from '@vercel/node';

// ===============================
// MEMÓRIA ANTI-DUPLICAÇÃO
// ===============================
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  const token = "SEU_TOKEN";
  const chat_id = "SEU_CHAT_ID";
  const versao = "68";

  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';

  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };

  const horaBR = agora.toLocaleTimeString('pt-BR', options);
  const [h, m] = horaBR.split(':').map(Number);
  const horaNum = h * 100 + m;
  const diaSemana = agora.getDay();

  // ===============================
  // STATUS MERCADO EURUSD
  // ===============================
  const getStatus = (label: string) => {

    if (label === "BTCUSD") return true;

    if (label === "EURUSD") {

      if (diaSemana >= 1 && diaSemana <= 4) {
        return (horaNum <= 1800) || (horaNum >= 2200);
      }

      if (diaSemana === 5) return horaNum <= 1630;
      if (diaSemana === 0) return horaNum >= 2200;
    }

    return false;
  };

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" }
  ];

  // ===============================
  // RSI
  // ===============================
  const calcularRSI = (dados: any[], idx: number) => {

    const period = 9;
    if (idx < period) return 50;

    let gains = 0, losses = 0;

    for (let j = idx - (period - 1); j <= idx; j++) {
      const diff = dados[j].c - dados[j - 1].c;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  };

  try {

    for (const ativo of ATIVOS) {

      if (!getStatus(ativo.label)) continue;

      // ===============================
      // FETCH
      // ===============================
      const url = ativo.source === "kucoin"
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`;

      const resApi = await fetch(url);
      const json = await resApi.json();

      let candles: any[] = [];

      if (ativo.source === "kucoin") {

        candles = json.data.map((v: any) => ({
          t: parseInt(v[0]),
          o: +v[1],
          c: +v[2],
          h: +v[3],
          l: +v[4]
        })).reverse();

      } else {

        const r = json.chart.result[0];
        const q = r.indicators.quote[0];

        candles = r.timestamp.map((t: any, i: number) => ({
          t: t * 1000, // ✔️ NORMALIZAÇÃO TIMESTAMP
          o: q.open[i],
          c: q.close[i],
          h: q.high[i],
          l: q.low[i]
        })).filter((v: any) => v.c !== null);
      }

      if (candles.length < 10) continue;

      // ===============================
      // SINCRONIA RT_ROBO_V.01
      // ===============================
      const i = candles.length - 1;

      const rsi_val = calcularRSI(candles, i);
      const rsi_ant = calcularRSI(candles, i - 1);

      const f_alta =
        candles[i-2].l < candles[i-4].l &&
        candles[i-2].l < candles[i-3].l &&
        candles[i-2].l < candles[i-1].l &&
        candles[i-2].l < candles[i].l;

      const f_baixa =
        candles[i-2].h > candles[i-4].h &&
        candles[i-2].h > candles[i-3].h &&
        candles[i-2].h > candles[i-1].h &&
        candles[i-2].h > candles[i].h;

      const rsi_subindo = rsi_val > rsi_ant;
      const rsi_caindo = rsi_val < rsi_ant;

      const rsi_call_ok = (rsi_val >= 55 || rsi_val >= 30) && rsi_subindo;
      const rsi_put_ok  = (rsi_val <= 45 || rsi_val <= 70) && rsi_caindo;

      let sinal = "";

      if (f_alta && rsi_call_ok && candles[i].c > candles[i].o)
        sinal = "ACIMA";

      if (f_baixa && rsi_put_ok && candles[i].c < candles[i].o)
        sinal = "ABAIXO";

      if (!sinal) continue;

      // ===============================
      // ID ÚNICO ANTI DUPLICAÇÃO
      // ===============================
      const opId = `${ativo.label}_${candles[i].t}`;

      if (lastSinais[opId]) continue;
      lastSinais[opId] = true;

      // ===============================
      // HORA DA VELA = TELEGRAM
      // ===============================
      const hVela = new Date(candles[i].t)
        .toLocaleTimeString('pt-BR', {
          timeZone,
          hour: '2-digit',
          minute: '2-digit'
        });

      const emoji = sinal === "ACIMA" ? "🟢" : "🔴";
      const seta  = sinal === "ACIMA" ? "↑" : "↓";

      const msg =
`${emoji} <b>SINAL EMITIDO!</b>
<b>ATIVO:</b> ${ativo.label}
<b>SINAL:</b> ${seta} ${sinal}
<b>VELA:</b> ${hVela}`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: msg,
          parse_mode: "HTML"
        })
      });
    }

    return res.status(200).send("V68 OK");

  } catch {
    return res.status(200).send("STANDBY");
  }
}
