import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "31"; 
  
  // Fuso Horário São Paulo (UTC-3) conforme o print da OPTNEX
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  const diaSemana = agora.getDay(); 
  const horaBrasilia = parseInt(agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  
  const isForexOpen = (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && horaBrasilia < 18) || (diaSemana === 0 && horaBrasilia >= 19);

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin", type: "crypto" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo", type: "forex" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo", type: "forex" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo", type: "forex" }
  ];

  try {
    for (const ativo of ATIVOS) {
      if (ativo.type === "forex" && !isForexOpen) continue;

      // M15 CONFIGURADO
      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`;

      const response = await fetch(url);
      const json = await response.json();
      let candles: any[] = [];

      if (ativo.source === "kucoin") {
        if (!json.data) continue;
        candles = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]) })).reverse();
      } else {
        const r = json.chart.result?.[0];
        if (!r || !r.timestamp) continue;
        candles = r.timestamp.map((t: any, idx: number) => ({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx]
        })).filter((v: any) => v.c !== null && v.o !== null);
      }

      if (candles.length < 50) continue;
      const i = candles.length - 1; // Vela atual (em formação)
      const p = i - 1;             // Vela anterior (fechada)

      const getEMA = (period: number, idx: number) => {
        const k = 2 / (period + 1);
        let ema = candles[idx - 40].c; 
        for (let j = idx - 39; j <= idx; j++) ema = candles[j].c * k + ema * (1 - k);
        return ema;
      };

      const getRSI = (idx: number, period: number) => {
        let g = 0, l = 0;
        for (let j = idx - period + 1; j <= idx; j++) {
          const d = candles[j].c - candles[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      // Cálculo na vela atual para emitir o sinal no início da abertura
      const e4_i = getEMA(4, i); const e8_i = getEMA(8, i);
      const e4_p = getEMA(4, p); const e8_p = getEMA(8, p);
      const rsi_i = getRSI(i, 9); const rsi_p = getRSI(p, 9);
      const isVerde = candles[i].c > candles[i].o;
      const isVermelha = candles[i].c < candles[i].o;

      let sinalStr = "";
      if (e4_p <= e8_p && e4_i > e8_i && (rsi_i > 30 || rsi_i > 50) && rsi_i > rsi_p && isVerde) {
        sinalStr = "ACIMA";
      } else if (e4_p >= e8_p && e4_i < e8_i && (rsi_i < 70 || rsi_i < 50) && rsi_i < rsi_p && isVermelha) {
        sinalStr = "ABAIXO";
      }

      if (sinalStr) {
        const signalKey = `${ativo.label}_${sinalStr}_${candles[i].t}`;
        if (lastSinais[ativo.label] !== signalKey) {
          lastSinais[ativo.label] = signalKey;
          const icon = sinalStr === "ACIMA" ? "🟢" : "🔴";
          
          // Formatação exata para bater com o gráfico (Ex: 22:00, 22:15)
          const hVela = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { 
            timeZone: 'America/Sao_Paulo', 
            hour: '2-digit', 
            minute: '2-digit' 
          });

          const msg = `SINAL EMITIDO!\n<b>ATIVO</b>: ${ativo.label}\n<b>SINAL</b>: ${icon} ${sinalStr}\n<b>VELA</b>: ${hVela}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
          });
        }
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8"><title>RICARDO SENTINELA PRO</title>
      <style>
        :root { --primary: #00ff88; --bg: #050505; }
        body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 30px 20px; }
        h1 { font-size: 24px; text-align: center; font-weight: 900; color: #FFFFFF; }
        .footer { margin-top: 25px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; }
        .revision-table { width: 100%; margin-top: 25px; border-collapse: collapse; font-size: 9px; }
        .revision-table th { text-align: left; color: var(--primary); border-bottom: 1px solid rgba(255,255,255,0.1); }
      </style> </head> <body>
      <div class="main-card">
        <h1>RICARDO SENTINELA BOT</h1>
        <div style="text-align:center; color:var(--primary); margin-bottom:20px;">● MONITORAMENTO M15 ATIVO</div>
        <div class="footer">
          <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div>
          <div><b>HORA</b><p>${dataHora.split(',')[1]}</p></div>
          <div><b>VERSÃO</b><p style="color:var(--primary)">${versao}</p></div>
          <div><b>STATUS</b><p>SINCRONIZADO OPTNEX</p></div>
        </div>
        <table class="revision-table">
          <thead><tr><th>Nº</th><th>DATA</th><th>HORA</th><th>MOTIVO</th></tr></thead>
          <tbody>
            <tr><td>31</td><td>06/02/26</td><td>22:15</td><td>Sincronização M15 com Gráfico OPTNEX</td></tr>
            <tr><td>30</td><td>06/02/26</td><td>22:01</td><td>Migração M15 + Formato Telegram</td></tr>
            <tr><td>29</td><td>06/02/26</td><td>21:17</td><td>Base Aprovada (Correção UTC-3)</td></tr>
          </tbody>
        </table>
      </div>
      <script>setTimeout(()=>location.reload(), 60000);</script>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
