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

  const dataHora = `${dataBR},${horaBR}`;

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
        body: JSON.stringify({ chat_id, text: msg })
      });
    }

  } catch {}

  // ===============================
  // STATUS VISUAL EURUSD
  // ===============================
  const statusEur = sinais.EURUSD;
  const bgEur =
    statusEur === "CALL" ? "rgba(0,255,136,0.15)" :
    statusEur === "PUT"  ? "rgba(255,80,80,0.15)" :
    "rgba(255,255,255,0.08)";

  const colorEur =
    statusEur === "PUT" ? "#ff5050" :
    "#00ff88";

  // ===============================
  // HTML CYBER (O SEU)
  // ===============================
  return res.status(200).send(`

<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RICARDO SENTINELA PRO</title>

<style>
:root {
 --primary: #00ff88;
 --bg: #050505;
}

body {
 background-color: var(--bg);
 background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0);
 background-size: 32px 32px;
 color: #fff;
 font-family: Inter, sans-serif;
 display: flex;
 justify-content: center;
 align-items: center;
 min-height: 100vh;
 margin: 0;
}

.main-card {
 width: 95%;
 max-width: 420px;
 background: rgba(17,17,17,0.85);
 backdrop-filter: blur(20px);
 border: 1px solid rgba(255,255,255,0.1);
 border-radius: 32px;
 padding: 30px 20px;
 box-shadow: 0 25px 50px rgba(0,0,0,0.8);
}

h1 {
 font-size: 22px;
 text-align: center;
 margin-bottom: 20px;
 font-weight: 900;
 text-transform: uppercase;
 color: #FFFFFF;
 text-shadow: 0 0 10px rgba(0,255,136,0.5);
}

.status-badge {
 display:flex;
 justify-content:center;
 gap:10px;
 background:rgba(0,255,136,0.08);
 border:1px solid rgba(0,255,136,0.2);
 padding:10px;
 border-radius:14px;
 font-size:11px;
 color:#00ff88;
 margin-bottom:20px;
}

.asset-card{
 background:rgba(255,255,255,0.03);
 border:1px solid rgba(255,255,255,0.05);
 padding:12px 15px;
 border-radius:12px;
 display:flex;
 justify-content:space-between;
 margin-bottom:8px;
}

.status-pill{
 font-size:10px;
 font-weight:800;
 padding:6px 12px;
 border-radius:6px;
}

.footer{
 margin-top:25px;
 padding-top:15px;
 border-top:1px solid rgba(255,255,255,0.08);
 display:grid;
 grid-template-columns:1fr 1fr;
 gap:15px;
 text-align:center;
}
</style>
</head>

<body>

<div class="main-card">

<h1>RICARDO SENTINELA BOT</h1>

<div class="status-badge">EM MONITORAMENTO...</div>

<div class="asset-card">
<span>BTCUSD</span>
<span class="status-pill"
style="background:rgba(0,255,136,0.15);color:#00ff88">
ABERTO
</span>
</div>

<div class="asset-card">
<span>EURUSD</span>
<span class="status-pill"
style="background:${bgEur};color:${colorEur}">
${statusEur}
</span>
</div>

<div class="footer">
<div><b>DATA</b><p>${dataBR}</p></div>
<div><b>HORA</b><p>${horaBR}</p></div>
<div><b>VERSÃO</b><p style="color:#00ff88;font-weight:bold">${versao}</p></div>
<div><b>STATUS</b><p style="color:#00ff88;font-weight:bold">ATIVO</p></div>
</div>

</div>

<script>
setTimeout(()=>location.reload(),20000);
</script>

</body>
</html>

`);
}
