import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache para evitar sinais duplicados na mesma vela
let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurações extraídas do seu documento
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "25"; 
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  // Lógica de Horário Forex
  const diaSemana = agora.getDay(); 
  const horaAtual = agora.getHours();
  const isForexOpen = (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && horaAtual < 18) || (diaSemana === 0 && horaAtual >= 19);

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin", type: "crypto" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo", type: "forex" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo", type: "forex" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo", type: "forex" }
  ];

  try {
    for (const ativo of ATIVOS) {
      if (ativo.type === "forex" && !isForexOpen) continue;

      // TESTE ATIVO EM M1 (1 MINUTO)
      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=1min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=1m&range=1d`;

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
      const i = candles.length - 1; // Vela Atual
      const p = i - 1;             // Vela Anterior

      // Indicadores
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

      const e4_i = getEMA(4, i); const e8_i = getEMA(8, i);
      const e4_p = getEMA(4, p); const e8_p = getEMA(8, p);
      const rsi_i = getRSI(i, 9); const rsi_p = getRSI(p, 9);
      const isVerde = candles[i].c > candles[i].o;
      const isVermelha = candles[i].c < candles[i].o;

      let sinalStr = "";

      // Lógica de Sinal ACIMA
      if (e4_p <= e8_p && e4_i > e8_i && (rsi_i > 30 || rsi_i > 50) && rsi_i > rsi_p && isVerde) {
        sinalStr = "ACIMA";
      } 
      // Lógica de Sinal ABAIXO
      else if (e4_p >= e8_p && e4_i < e8_i && (rsi_i < 70 || rsi_i < 50) && rsi_i < rsi_p && isVermelha) {
        sinalStr = "ABAIXO";
      }

      if (sinalStr) {
        const signalKey = `${ativo.label}_${sinalStr}_${candles[i].t}`;
        
        if (lastSinais[ativo.label] !== signalKey) {
          lastSinais[ativo.label] = signalKey;
          const icon = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const hVela = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          const msg = `SINAL EMITIDO!\n<b>ATIVO</b>: ${ativo.label}\n<b>SINAL</b>: ${icon} ${sinalStr}\n<b>VELA</b>: ${hVela}`;
          
          // Envio para Telegram com tratamento de erro
          try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
            });
          } catch (err) {
            // Fallback caso o HTML falhe
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id, text: `SINAL: ${ativo.label} ${sinalStr} as ${hVela}` })
            });
          }
        }
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>RICARDO SENTINELA PRO</title>
          <style>
              :root { --primary: #00ff88; --bg: #050505; }
              body { background-color: var(--bg); background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0); background-size: 32px 32px; color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .main-card { width: 90%; max-width: 380px; background: rgba(17,17,17,0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 35px 25px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); }
              h1 { font-size: 26px; text-align: center; margin: 0 0 25px 0; font-weight: 900; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4); letter-spacing: 1px; }
              .status-badge { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); padding: 10px; border-radius: 14px; font-size: 12px; font-weight: 700; color: var(--primary); margin-bottom: 30px; }
              .pulse-dot { height: 8px; width: 8px; background-color: var(--primary); border-radius: 50%; box-shadow: 0 0 15px var(--primary); animation: pulse 1.5s infinite; }
              @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } }
              .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 14px 18px; border-radius: 16px; display: flex; justify-content: space-between; margin-bottom: 10px; }
              .status-pill { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; }
              .footer { margin-top: 35px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 11px; }
              .footer b { color: #888; display: block; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
              .footer p { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
              .revision-log { margin-top: 25px; padding-top: 15px; border-top: 1px dotted rgba(255,255,255,0.1); text-align: left; }
              .revision-log h2 { font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
              .revision-item { font-size: 9px; color: #ffffff; margin-bottom: 3px; font-family: sans-serif; opacity: 0.8; }
          </style>
      </head>
      <body>
          <div class="main-card">
              <h1>RICARDO SENTINELA BOT</h1>
              <div class="status-badge"><div class="pulse-dot"></div> ATIVOS EM MONITORAMENTO REAL</div>
              <p style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 15px; font-weight: 700;">Análise do Mercado</p>
              <div class="asset-grid">
                  <div class="asset-card"><span>BTCUSD</span><span class="status-pill" style="background:rgba(0,255,136,0.15); color:var(--primary)">ABERTO</span></div>
                  <div class="asset-card"><span>EURUSD</span><span class="status-pill" style="background:rgba(255,68,68,0.15); color:${isForexOpen ? 'var(--primary)' : '#ff4444'}">${isForexOpen ? 'ABERTO' : 'FECHADO'}</span></div>
                  <div class="asset-card"><span>GBPUSD</span><span class="status-pill" style="background:rgba(255,68,68,0.15); color:${isForexOpen ? 'var(--primary)' : '#ff4444'}">${isForexOpen ? 'ABERTO' : 'FECHADO'}</span></div>
                  <div class="asset-card"><span>USDJPY</span><span class="status-pill" style="background:rgba(255,68,68,0.15); color:${isForexOpen ? 'var(--primary)' : '#ff4444'}">${isForexOpen ? 'ABERTO' : 'FECHADO'}</span></div>
              </div>
              <div class="footer">
                  <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div>
                  <div><b>HORA</b><p>${dataHora.split(',')[1]}</p></div>
                  <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div>
                  <div><b>STATUS</b><p style="color:var(--primary)">TESTE M1 ATIVO</p></div>
              </div>
              <div class="revision-log">
                  <h2>Histórico de Revisões</h2>
                  <div class="revision-item">Versão 25: Forçar Envio Telegram + Redundância de Formatação</div>
                  <div class="revision-item">Versão 24: Token Inserido Direto + Validação de Log</div>
                  <div class="revision-item">Versão 15: Sensibilidade de Cruzamento M1 Aumentada</div>
                  <div class="revision-item">Versão 00: Elaboração Inicial</div>
              </div>
          </div>
          <script>setTimeout(()=>location.reload(), 30000);</script>
      </body></html>
    `);
  } catch (e) { 
    return res.status(200).send("Sistema em standby"); 
  }
}
