import { VercelRequest, VercelResponse } from '@vercel/node';

// ===============================
// MEMÓRIA ANTI-DUPLICAÇÃO
// ===============================
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  const token   = "SEU_TOKEN";
  const chat_id = "SEU_CHAT_ID";
  const versao  = "68";

  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';

  // ===============================
  // DATA / HORA
  // ===============================
  const dataBR = agora.toLocaleDateString('pt-BR');
  const horaBR = agora.toLocaleTimeString('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit'
  });

  const [h, m] = horaBR.split(':').map(Number);
  const horaNum = h * 100 + m;
  const diaSemana = agora.getDay();

  // ===============================
  // STATUS MERCADO
  // ===============================
  const getStatus = (label: string) => {

    if (label === "BTCUSD") return true;

    if (label === "EURUSD") {

      if (diaSemana >= 1 && diaSemana <= 4)
        return (horaNum <= 1800) || (horaNum >= 2200);

      if (diaSemana === 5) return horaNum <= 1630;
      if (diaSemana === 0) return horaNum >= 2200;
    }

    return false;
  };

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" }
  ];

  let sinais: any = {
    EURUSD: "AGUARDAR"
  };

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

  // ===============================
  // LOOP ATIVOS
  // ===============================
  try {

    for (const ativo of ATIVOS) {

      if (!getStatus(ativo.label)) continue;

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
          t: t * 1000,
          o: q.open[i],
          c: q.close[i],
          h: q.high[i],
          l: q.low[i]
        })).filter((v: any) => v.c !== null);
      }

      if (candles.length < 10) continue;

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
      const rsi_caindo  = rsi_val < rsi_ant;

      let sinal = "";

      if (f_alta && rsi_subindo && candles[i].c > candles[i].o)
        sinal = "CALL";

      if (f_baixa && rsi_caindo && candles[i].c < candles[i].o)
        sinal = "PUT";

      if (!sinal) continue;

      sinais[ativo.label] = sinal;

      const opId = `${ativo.label}_${candles[i].t}`;
      if (lastSinais[opId]) continue;
      lastSinais[opId] = true;

      const msg =
`🚨 SINAL V${versao}

ATIVO: ${ativo.label}
SINAL: ${sinal}
HORA: ${horaBR}`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: msg
        })
      });
    }

  } catch {}

  // ===============================
  // HTML PANEL
  // ===============================
  return res.status(200).send(`

<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>RICARDO SENTINELA PRO v68</title>

<style>
body{
background:#050505;
color:#fff;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
margin:0;
}
.card{
background:#111;
padding:30px;
border-radius:20px;
width:380px;
box-shadow:0 0 30px #000;
}
h1{text-align:center;color:#00ff88;}
.asset{
display:flex;
justify-content:space-between;
padding:10px;
margin:6px 0;
background:#1a1a1a;
border-radius:8px;
}
.table{
width:100%;
font-size:10px;
margin-top:20px;
}
</style>
</head>

<body>

<div class="card">

<h1>SENTINELA v68</h1>

<div class="asset">
<span>BTCUSD</span>
<span>ABERTO</span>
</div>

<div class="asset">
<span>EURUSD</span>
<span>${sinais.EURUSD}</span>
</div>

<hr>

<div>DATA: ${dataBR}</div>
<div>HORA: ${horaBR}</div>
<div>STATUS: ATIVO</div>

<table class="table">
<tr><td>68</td><td>13/02</td><td>HTML + API</td></tr>
<tr><td>61</td><td>13/02</td><td>Fix Yahoo</td></tr>
<tr><td>51</td><td>12/02</td><td>Refino</td></tr>
<tr><td>50</td><td>12/02</td><td>Sync</td></tr>
<tr><td>49</td><td>12/02</td><td>Martingale OFF</td></tr>
</table>

</div>
</body>
</html>

`);
}
