import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "77"; 
  
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });
  const optionsTime = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaMinutoInt = parseInt(agora.toLocaleTimeString('pt-BR', optionsTime).replace(':', ''));
  const diaSemana = agora.getDay(); 

  const getStatus = (label: string): boolean => {
    if (label === "BTCUSD") return true;
    if (label === "EURUSD") {
      if (diaSemana === 5) return horaMinutoInt <= 1630;
      if (diaSemana === 6) return false;
      if (diaSemana === 0) return horaMinutoInt >= 2200;
      return !(horaMinutoInt >= 1801 && horaMinutoInt <= 2159);
    }
    return false;
  };

  const ATIVOS = [
    { symbol: "BTCUSDT", label: "BTCUSD", sources: ["binance", "bybit", "kucoin"], symKucoin: "BTC-USDT" },
    { symbol: "EURUSDT", label: "EURUSD", sources: ["binance", "bybit", "kucoin"], symKucoin: "EUR-USDT" }
  ];

  const calcularRSI = (dados: any[], idx: number) => {
    const period = 9;
    if (idx < period || !dados[idx]) return 50;
    let gains = 0, losses = 0;
    for (let j = idx - (period - 1); j <= idx; j++) {
      if (!dados[j] || !dados[j-1]) continue;
      const diff = dados[j].c - dados[j-1].c;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  };

  const calcularEMA = (dados: any[], periodo: number) => {
    if (dados.length < periodo) return 0;
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let i = 1; i < dados.length; i++) {
      ema = (dados[i].c * k) + (ema * (1 - k));
    }
    return ema;
  };

  try {
    for (const ativo of ATIVOS) {
      if (!getStatus(ativo.label)) continue;

      let candles: any[] = [];
      let fonteVencedora = "";

      for (const fonte of ativo.sources) {
        try {
          let url = "";
          if (fonte === "binance") url = `https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=100`;
          if (fonte === "bybit") url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${ativo.symbol}&interval=15&limit=100`;
          if (fonte === "kucoin") url = `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symKucoin}&type=15min&cb=${Date.now()}`;

          const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
          const json = await res.json();

          if (fonte === "binance" && Array.isArray(json)) {
            candles = json.map(v => ({ t: parseInt(v[0]), o: parseFloat(v[1]), h: parseFloat(v[2]), l: parseFloat(v[3]), c: parseFloat(v[4]) }));
          } else if (fonte === "bybit" && json.result?.list) {
            candles = json.result.list.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), h: parseFloat(v[2]), l: parseFloat(v[3]), c: parseFloat(v[4]) })).reverse();
          } else if (fonte === "kucoin" && json.data) {
            candles = json.data.map((v: any) => ({ t: parseInt(v[0])*1000, o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
          }

          if (candles.length > 25) {
            fonteVencedora = fonte.toUpperCase();
            break; 
          }
        } catch (e) { continue; }
      }

      if (candles.length < 25) continue;

      for (let j = 0; j < 3; j++) {
        const i = (candles.length - 1) - j;
        if (i < 4) continue;

        const rsi_val = calcularRSI(candles, i);
        const rsi_ant = calcularRSI(candles, i - 1);
        const ema_20 = calcularEMA(candles.slice(0, i + 1), 20);
        
        // Lógica Fractal RT_ROBO_V.02 
        const f_alta = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;
        const f_baixa = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
        
        const rsi_subindo = rsi_val > rsi_ant;
        const rsi_caindo = rsi_val < rsi_ant;

        let sinalStr = "";
        // Alinhamento total com RT_ROBO_V.02 
        if (f_alta && (rsi_val >= 55 || rsi_val >= 30) && rsi_subindo && candles[i].c > ema_20 && candles[i].c > candles[i].o) sinalStr = "ACIMA";
        if (f_baixa && (rsi_val <= 45 || rsi_val <= 70) && rsi_caindo && candles[i].c < ema_20 && candles[i].c < candles[i].o) sinalStr = "ABAIXO";

        if (sinalStr) {
          const opId = `${ativo.label}_${candles[i].t}_${sinalStr}`;
          if (!lastSinais[opId]) {
            lastSinais[opId] = true;
            const emoji = sinalStr === "ACIMA" ? "🟢" : "🔴";
            const seta = sinalStr === "ACIMA" ? "↑" : "↓";
            const hVela = new Date(candles[i].t).toLocaleTimeString('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' });
            
            const msg = `${emoji} <b>SINAL EMITIDO!</b>\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${seta} ${sinalStr}\n<b>VELA:</b> ${hVela}\n<b>FONTE:</b> ${fonteVencedora}`;
            
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) 
            });
          }
        }
      }
    }

    const statusEur = getStatus("EURUSD") ? "ABERTO" : "FECHADO";
    const logoSvg = `<svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="5,3"/><circle cx="50" cy="50" r="35" fill="none" stroke="#00ff88" stroke-width="1" opacity="0.5"/><path d="M50 15 L50 35 M85 50 L65 50 M50 85 L50 65 M15 50 L35 50" stroke="#00ff88" stroke-width="2"/><text x="50" y="65" font-family="Arial" font-size="40" font-weight="900" fill="#00ff88" text-anchor="middle">R</text></svg>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8"><title>SENTINELA v${versao}</title>
      <style>:root{--primary:#00ff88;--bg:#050505}body{background:var(--bg);color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
      .card{width:380px;background:rgba(17,17,17,0.9);padding:30px;border-radius:25px;border:1px solid #333;text-align:center;box-shadow: 0 10px 30px rgba(0,0,0,0.5)}
      .badge{padding:8px 15px;border-radius:10px;font-size:11px;font-weight:bold;margin-top:15px;display:inline-block;background:rgba(0,255,136,0.1);color:var(--primary)}
      .rev-table{width:100%;margin-top:20px;font-size:9px;color:#888;text-align:left;border-collapse:collapse}
      .rev-table td{padding:5px;border-bottom:1px solid rgba(255,255,255,0.05)}</style></head>
      <body><div class="card">${logoSvg}<h1>SENTINELA BOT</h1><div class="badge">V.${versao} - TRIPLA REDUNDÂNCIA TOTAL</div>
      <div style="margin-top:20px; font-size: 14px;">EURUSD: <span style="color:${statusEur === "ABERTO" ? "#00ff88" : "#ff4444"}">${statusEur}</span> | BTCUSD: <span style="color:#00ff88">ABERTO</span></div>
      <table class="rev-table">
        <tr><td>77</td><td>14/02/26</td><td>Tripla Redundância Total + Lógica V.02 (EMA/Fractal/Vela)</td></tr>
        <tr><td>76</td><td>14/02/26</td><td>Restauração Dashboard v73 + Fix EURUSD Binance</td></tr>
      </table></div><script>setTimeout(()=>location.reload(),30000)</script></body></html>
    `);
  } catch (e) { return res.status(200).send("Aguardando Inicialização..."); }
}
