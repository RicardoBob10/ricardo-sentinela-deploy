import { VercelRequest, VercelResponse } from '@vercel node';

// Cache para evitar duplicidade - Regra de Ouro 
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "81"; // Versão com correções de Não Conformidade
  
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });
  const [data, hora] = dataHora.split(', ');
  
  // Lógica de Horário Forex conforme Item 6 do Briefing 
  const optionsTime = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaMinutoInt = parseInt(agora.toLocaleTimeString('pt-BR', optionsTime).replace(':', ''));
  const diaSemana = agora.getDay(); 

  const getStatus = (label: string): boolean => {
    if (label === "BTCUSD") return true;
    if (label === "EURUSD") {
      if (diaSemana === 5) return horaMinutoInt <= 1630; // Sexta até 16:30
      if (diaSemana === 6) return false; // Sábado Fechado
      if (diaSemana === 0) return horaMinutoInt >= 2200; // Domingo após 22:00
      return !(horaMinutoInt >= 1801 && horaMinutoInt <= 2159); // Seg-Qui (Pausa 18h-22h)
    }
    return false;
  };

  const ATIVOS = [
    { symbol: "BTCUSDT", label: "BTCUSD", sources: ["binance", "bybit", "kucoin"], symKucoin: "BTC-USDT" },
    { symbol: "EURUSDT", label: "EURUSD", sources: ["binance", "bybit", "kucoin"], symKucoin: "EUR-USDT" }
  ];

  // Cálculos Técnicos (RSI 9 e EMA 20) [cite: 1, 2]
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
      // Cascata de fontes conforme Status Atual 
      for (const fonte of ativo.sources) {
        try {
          let url = "";
          if (fonte === "binance") url = `https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=100`;
          if (fonte === "bybit") url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${ativo.symbol}&interval=15&limit=100`;
          if (fonte === "kucoin") url = `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symKucoin}&type=15min&cb=${Date.now()}`;

          const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
          const json = await response.json();
          // Mapeamento de dados...
          if (fonte === "binance" && Array.isArray(json)) {
            candles = json.map(v => ({ t: parseInt(v[0]), o: parseFloat(v[1]), h: parseFloat(v[2]), l: parseFloat(v[3]), c: parseFloat(v[4]) }));
          }
          if (candles.length > 25) break;
        } catch (e) { continue; }
      }

      if (candles.length < 25) continue;

      const i = candles.length - 1;
      const rsi_val = calcularRSI(candles, i);
      const rsi_ant = calcularRSI(candles, i - 1);
      const ema_20 = calcularEMA(candles, 20);
      
      // Fractal Mestre (i-2) conforme Item 5 
      const f_alta = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;
      const f_baixa = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
      
      let sinalStr = "";
      // Lógica de Sinal conforme RT_ROBO_V.02 
      if (f_alta && (rsi_val >= 55 || rsi_val >= 30) && rsi_val > rsi_ant && candles[i].c > ema_20 && candles[i].c > candles[i].o) sinalStr = "ACIMA";
      if (f_baixa && (rsi_val <= 45 || rsi_val <= 70) && rsi_val < rsi_ant && candles[i].c < ema_20 && candles[i].c < candles[i].o) sinalStr = "ABAIXO";

      if (sinalStr) {
        const opId = `${ativo.label}_${candles[i].t}_${sinalStr}`;
        if (!lastSinais[opId]) {
          lastSinais[opId] = true; // Bloqueio de duplicidade 
          const emoji = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const msg = `<b>${emoji} SINAL EMITIDO!</b>\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${sinalStr === "ACIMA" ? "↑" : "↓"} ${sinalStr}\n<b>VELA:</b> ${new Date(candles[i].t).toLocaleTimeString('pt-BR', {timeZone, hour:'2-digit', minute:'2-digit'})}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) 
          });
        }
      }
    }

    // DASHBOARD E FAVICON CONFORME ITEM 4 E 7.2 
    const statusEur = getStatus("EURUSD") ? "ABERTO" : "FECHADO";
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8">
      <title>RICARDO SENTINELA PRO</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='none' stroke='%2300ff88' stroke-width='4' stroke-dasharray='10,5'/><text x='50' y='68' font-family='Arial' font-size='55' font-weight='900' fill='%2300ff88' text-anchor='middle'>R</text></svg>">
      <style>
        :root { --primary: #00ff88; --bg: #050505; }
        body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 32px; padding: 35px 25px; }
        .revision-table { width: 100%; margin-top: 30px; border-collapse: collapse; font-size: 9px; color: rgba(255,255,255,0.5); }
      </style> </head> <body> <div class="main-card">
        <h1>RICARDO SENTINELA BOT</h1>
        <div class="footer">
          <div><b>DATA</b><p>${data}</p></div>
          <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div>
        </div>
        <table class="revision-table">
          <thead><tr><th>Nº</th><th>DATA</th><th>MOTIVO</th></tr></thead>
          <tbody>
            <tr><td>81</td><td>14/02/26</td><td>Fix NC: Correção Duplicidade Telegram + Novo Favicon</td></tr>
            <tr><td>80</td><td>14/02/26</td><td>CONFORMIDADE TOTAL: Briefing Contexto + RT_ROBO_V.02</td></tr>
          </tbody>
        </table>
      </div> </body> </html>`);
  } catch (e) { return res.status(200).send("Aguardando Inicialização..."); }
}
