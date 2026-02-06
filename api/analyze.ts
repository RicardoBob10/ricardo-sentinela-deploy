import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurações vindas das Environment Variables da Vercel
  const token = process.env.TG_TOKEN || "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = process.env.TG_CHAT_ID || "7625668696";
  const versao = "13"; 
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo" }
  ];

  try {
    for (const ativo of ATIVOS) {
      // ALTERADO PARA M1 PARA TESTE DE SINAIS (CONFORME SOLICITADO)
      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=1min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=1m&range=1d`;

      const response = await fetch(url);
      const json = await response.json();
      let c: any[] = [];

      if (ativo.source === "kucoin") {
        if (!json.data) continue;
        c = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
      } else {
        const r = json.chart.result[0];
        if (!r || !r.timestamp) continue;
        c = r.timestamp.map((t: any, idx: number) => ({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx], h: r.indicators.quote[0].high[idx], l: r.indicators.quote[0].low[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (c.length < 50) continue;
      const i = c.length - 1; 
      const p = i - 1;

      // Cálculo EMA 4 e 8
      const getEMA = (period: number, idx: number) => {
        const k = 2 / (period + 1);
        let ema = c[idx - 40].c; 
        for (let j = idx - 39; j <= idx; j++) ema = c[j].c * k + ema * (1 - k);
        return ema;
      };

      // Cálculo RSI 9
      const getRSI = (idx: number, period: number) => {
        let g = 0, l = 0;
        for (let j = idx - period + 1; j <= idx; j++) {
          const d = c[j].c - c[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      const e4_atual = getEMA(4, i);
      const e8_atual = getEMA(8, i);
      const e4_prev = getEMA(4, p);
      const e8_prev = getEMA(8, p);
      const rsi9 = getRSI(i, 9);
      const rsi9_prev = getRSI(p, 9);
      const isVerde = c[i].c > c[i].o;
      const isVermelha = c[i].c < c[i].o;

      let sinalStr = "";

      // LÓGICA SINAL ACIMA (EMA 4 cruza p/ cima EMA 8 + RSI 9 > 50 + RSI inclinado p/ cima + Vela Verde)
      if (e4_prev <= e8_prev && e4_atual > e8_atual && rsi9 > 50 && rsi9 > rsi9_prev && isVerde) {
        sinalStr = "ACIMA";
      }
      // LÓGICA SINAL ABAIXO (EMA 4 cruza p/ baixo EMA 8 + RSI 9 < 50 + RSI inclinado p/ baixo + Vela Vermelha)
      if (e4_prev >= e8_prev && e4_atual < e8_atual && rsi9 < 50 && rsi9 < rsi9_prev && isVermelha) {
        sinalStr = "ABAIXO";
      }

      if (sinalStr) {
        const sid = `${ativo.label}_${sinalStr}_${c[i].t}`;
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          const icon = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const horaVela = new Date(c[i].t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          const msg = `SINAL EMITIDO!\n**ATIVO**: ${ativo.label}\n**SINAL**: ${icon} ${sinalStr}\n**VELA**: ${horaVela}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'Markdown' })
          });
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
              .status-pill { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: rgba(0,255,136,0.15); color: var(--primary); }
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
                  <div class="asset-card"><span>BTCUSD</span><span class="status-pill">ABERTO</span></div>
                  <div class="asset-card"><span>EURUSD</span><span class="status-pill">ABERTO</span></div>
                  <div class="asset-card"><span>GBPUSD</span><span class="status-pill">ABERTO</span></div>
                  <div class="asset-card"><span>USDJPY</span><span class="status-pill">ABERTO</span></div>
              </div>
              <div class="footer">
                  <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div>
                  <div><b>HORA</b><p>${dataHora.split(',')[1]}</p></div>
                  <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div>
                  <div><b>STATUS</b><p style="color:var(--primary)">TESTE M1</p></div>
              </div>
              <div class="revision-log">
                  <h2>Histórico de Revisões</h2>
                  <div class="revision-item">Versão 13: Timeframe M1 para Teste + Revisão de Lógica de Cruzamento</div>
                  <div class="revision-item">Versão 12: Timeframe M15 + Histórico Alinhado à Esquerda (Fonte Branca)</div>
                  <div class="revision-item">Versão 11: Lógica Final EMA 4/8 + RSI 9 + Cor da Vela</div>
                  <div class="revision-item">Versão 10: Migração para Timeframe M15</div>
                  <div class="revision-item">Versão 09: Refinamento de Inclinação RSI e Layout</div>
                  <div class="revision-item">Versão 08: Ajuste Timeframe M1 para Teste</div>
                  <div class="revision-item">Versão 07: Lógica EMA 4/8 + RSI 9 + Cor Vela</div>
                  <div class="revision-item">Versão 06: Remoção de Fractais e Implementação EMA 9/21</div>
                  <div class="revision-item">Versão 02: Ajuste de Layout e Variáveis Vercel</div>
                  <div class="revision-item">Versão 01: Alteração do RSI de 14 para 9</div>
                  <div class="revision-item">Versão 00: Elaboração Inicial</div>
              </div>
          </div>
          <script>setTimeout(()=>location.reload(), 60000);</script>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
