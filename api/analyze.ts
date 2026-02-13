import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória temporária (Volátil, mas ajuda em execuções próximas)
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "65"; 
  
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const options: Intl.DateTimeFormatOptions = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false };
  const horaBRString = agora.toLocaleTimeString('pt-BR', options);
  const [h, m] = horaBRString.split(':').map(Number);
  const horaFormatada = h * 100 + m; 
  const diaSemana = agora.getDay();
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });

  // --- REGRAS DE ABERTURA CONFORME OPTNEX (ITEM 5) ---
  const getStatus = (label: string): boolean => {
    if (label === "BTCUSD") return true;
    if (label === "EURUSD") {
      // Segunda (1) a Quinta (4)
      if (diaSemana >= 1 && diaSemana <= 4) {
        return (horaFormatada >= 0 && horaFormatada <= 1800) || (horaFormatada >= 2200 && horaFormatada <= 2359);
      }
      // Sexta (5)
      if (diaSemana === 5) return (horaFormatada >= 0 && horaFormatada <= 1630);
      // Domingo (0)
      if (diaSemana === 0) return (horaFormatada >= 2200 && horaFormatada <= 2359);
    }
    return false;
  };

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" }
  ];

  const calcularRSI = (dados: any[], idx: number) => {
    const period = 9;
    if (idx < period) return 50;
    let gains = 0, losses = 0;
    for (let j = idx - (period - 1); j <= idx; j++) {
      const diff = dados[j].c - dados[j-1].c;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  };

  try {
    for (const ativo of ATIVOS) {
      if (!getStatus(ativo.label)) continue;

      try {
        const cacheBuster = Date.now();
        const urlM15 = ativo.source === "kucoin" 
          ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min&cb=${cacheBuster}`
          : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d&.ts=${cacheBuster}`;

        const resApi = await fetch(urlM15, { 
          headers: { 'User-Agent': 'Mozilla/5.0' }, 
          signal: AbortSignal.timeout(8000) 
        });
        
        const json = await resApi.json();
        let candles: any[] = [];

        if (ativo.source === "kucoin") {
          candles = json.data.map((v: any) => ({ 
            t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4])
          })).reverse();
        } else {
          const r = json.chart.result?.[0];
          const q = r.indicators.quote[0];
          candles = r.timestamp.map((t: any, idx: number) => ({
            t, o: q.open[idx], c: q.close[idx], h: q.high[idx], l: q.low[idx]
          })).filter((v: any) => v.c !== null && v.o !== null);
        }

        if (candles.length < 10) continue;
        
        const i = candles.length - 1; 
        const rsi_val = calcularRSI(candles, i);
        const rsi_ant = calcularRSI(candles, i - 1);

        // LÓGICA FRACTAL i-2 (IDÊNTICA AO RT_ROBO_V.01)
        const f_alta = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;
        const f_baixa = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;

        const rsi_subindo = rsi_val > rsi_ant;
        const rsi_caindo = rsi_val < rsi_ant;
        const rsi_call_ok = (rsi_val >= 55 || rsi_val >= 30) && rsi_subindo;
        const rsi_put_ok = (rsi_val <= 45 || rsi_val <= 70) && rsi_caindo;

        let sinalStr = "";
        if (f_alta && rsi_call_ok && candles[i].c > candles[i].o) sinalStr = "ACIMA";
        if (f_baixa && rsi_put_ok && candles[i].c < candles[i].o) sinalStr = "ABAIXO";

        if (sinalStr) {
          const dataVelaExec = new Date(candles[i].t * 1000);
          const hVela = dataVelaExec.toLocaleTimeString('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' });
          
          // Chave de unicidade para evitar duplicidade
          const opId = `${ativo.label}_${hVela}_${sinalStr}`;
          
          if (!lastSinais[opId]) {
            lastSinais[opId] = true;
            const emoji = sinalStr === "ACIMA" ? "🟢" : "🔴";
            const seta = sinalStr === "ACIMA" ? "↑" : "↓";
            
            // FORMATO APROVADO (Sem espaçamento entre linhas)
            const msg = `${emoji} <b>SINAL EMITIDO!</b>\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${seta} ${sinalStr}\n<b>VELA:</b> ${hVela}`;
            
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { 
              method: 'POST', headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) 
            });
          }
        }
      } catch (errAtivo) { continue; }
    }

    const isEurusdOpen = getStatus("EURUSD");
    const statusEur = isEurusdOpen ? "ABERTO" : "FECHADO";
    const bgEur = isEurusdOpen ? "rgba(0,255,136,0.15)" : "rgba(255,68,68,0.15)";
    const colorEur = isEurusdOpen ? "var(--primary)" : "#ff4444";
    const logoSvg = `<svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="5,3"/><circle cx="50" cy="50" r="35" fill="none" stroke="#00ff88" stroke-width="1" opacity="0.5"/><path d="M50 15 L50 35 M85 50 L65 50 M50 85 L50 65 M15 50 L35 50" stroke="#00ff88" stroke-width="2"/><text x="50" y="65" font-family="Arial" font-size="40" font-weight="900" fill="#00ff88" text-anchor="middle">R</text></svg>`;
    const faviconBase64 = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"> <title>RICARDO SENTINELA PRO</title> <link rel="icon" type="image/svg+xml" href="${faviconBase64}"> <style> :root { --primary: #00ff88; --bg: #050505; } body { background-color: var(--bg); background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0); background-size: 32px 32px; color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; } .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 30px 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); position: relative; overflow: hidden; } .logo-container { display: flex; justify-content: center; margin-bottom: 10px; } h1 { font-size: 22px; text-align: center; margin-bottom: 20px; font-weight: 900; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 0 10px rgba(0,255,136,0.5); } .status-badge { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); padding: 10px; border-radius: 14px; font-size: 11px; color: var(--primary); margin-bottom: 20px; } .pulse-dot { height: 8px; width: 8px; background-color: var(--primary); border-radius: 50%; animation: pulse 1.5s infinite; } @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } } .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; } .status-pill { font-size: 10px; font-weight: 800; padding: 6px 12px; border-radius: 6px; text-align: center; min-width: 60px; } .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: center; } .footer b { color: #888; font-size: 9px; text-transform: uppercase; display: block; margin-bottom: 4px; } .footer p { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; } .revision-table { width: 100%; margin-top: 25px; border-collapse: collapse; font-size: 9px; color: rgba(255,255,255,0.7); } .revision-table th { text-align: left; color: var(--primary); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 5px; text-transform: uppercase; } .revision-table td { padding: 5px; border-bottom: 1px solid rgba(255,255,255,0.05); } </style> </head> <body> <div class="main-card"> <div class="logo-container">${logoSvg}</div> <h1>RICARDO SENTINELA BOT</h1> <div class="status-badge"><div class="pulse-dot"></div> EM MONITORAMENTO...</div> <div class="asset-grid"> <div class="asset-card"><span>BTCUSD</span><span class="status-pill" style="background:rgba(0,255,136,0.15); color:var(--primary)">ABERTO</span></div> <div class="asset-card"><span>EURUSD</span><span class="status-pill" style="background:${bgEur}; color:${colorEur}">${statusEur}</span></div> </div> <div class="footer"> <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div> <div><b>HORA</b><p>${dataHora.split(',')[1]}</p></div> <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div> <div><b>STATUS</b><p style="color:var(--primary); font-weight:bold;">ATIVO</p></div> </div> <table class="revision-table"> <thead> <tr><th>Nº</th><th>DATA</th><th>HORA</th><th>MOTIVO</th></tr> </thead> <tbody> <tr><td>65</td><td>13/02/26</td><td>12:20</td><td>Fix Sinais EURUSD + Unicidade BTCUSD + Sync v65</td></tr> <tr><td>64</td><td>13/02/26</td><td>11:25</td><td>Fix Duplicidade BTC + Estabilidade EURUSD Yahoo</td></tr> <tr><td>63</td><td>13/02/26</td><td>10:55</td><td>Fix 500 Error + Timeout API + Sync 5 Rev</td></tr> <tr><td>62</td><td>13/02/26</td><td>10:30</td><td>Correção Erro 500 + Sincronia Telegram/Vela</td></tr> <tr><td>61</td><td>13/02/26</td><td>09:55</td><td>Fix EURUSD Yahoo + Sincronização Fractal v61</td></tr> </tbody> </table> </div> <script>setTimeout(()=>location.reload(), 20000);</script> </body></html>
    `);
  } catch (e) { return res.status(200).send("OK - Sistema em Standby"); }
}
