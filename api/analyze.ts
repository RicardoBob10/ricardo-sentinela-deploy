import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória de sinais para evitar duplicidade e garantir o ciclo de reversão
let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO - VERSÃO 92
  const versao = "92";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "21:40"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const agora = new Date();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);
  const horaMinutoInt = parseInt(horaAtualHHMM.replace(':', ''));
  const diaSemana = agora.getDay(); 

  // REGRA DE HORÁRIOS FOREX (ITEM 6)
  const getMercadoStatus = (): string => {
    if (diaSemana >= 1 && diaSemana <= 4) return "ABERTO";
    if (diaSemana === 5) return horaMinutoInt <= 1900 ? "ABERTO" : "FECHADO";
    if (diaSemana === 0) return horaMinutoInt >= 1901 ? "ABERTO" : "FECHADO";
    return "FECHADO";
  };
  const mercadoStatus = getMercadoStatus();

  // TRIPLA REDUNDÂNCIA (AÇÃO PARA NC 89-01, 89-02, 91-02)
  async function fetchCandles(symbol: string) {
    const controllers = [
      { name: 'Binance', url: `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100` },
      { name: 'Bybit', url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=15&limit=100` },
      { name: 'Kucoin', url: `https://api.kucoin.com/api/v1/market/candles?symbol=${symbol.replace('USDT', '-USDT')}&type=15min` }
    ];

    for (const api of controllers) {
      try {
        const response = await fetch(api.url, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) continue;
        const json = await response.json();
        
        // Normalização de dados para diferentes APIs
        if (api.name === 'Binance') return json;
        if (api.name === 'Bybit') return json.result.list.map((v: any) => [v[0], v[1], v[2], v[3], v[4]]);
        if (api.name === 'Kucoin') return json.data;
      } catch (e) { console.warn(`${api.name} falhou. Tentando próxima...`); }
    }
    return null;
  }

  try {
    const ativos = [
      { symbol: "BTCUSDT", label: "Bitcoin", prec: 2, operando: true },
      { symbol: "EURUSDT", label: "EURUSD", prec: 5, operando: mercadoStatus === "ABERTO" }
    ];

    for (const ativo of ativos) {
      if (!ativo.operando) continue;

      const candles = await fetchCandles(ativo.symbol);
      if (!candles || !Array.isArray(candles)) continue;

      const dados = candles.map((v: any) => ({
        t: Number(v[0]),
        c: parseFloat(v[4]),
        h: parseFloat(v[2]),
        l: parseFloat(v[3])
      })).filter(d => !isNaN(d.c));

      const i = dados.length - 1;
      const precoAtual = dados[i].c;
      const tempoVela = new Date(dados[i].t).toLocaleTimeString('pt-BR', optionsTime);

      // LÓGICA RT_ROBO_SCALPER_V3
      const calcEMA = (d: any[], p: number) => {
        const k = 2 / (p + 1);
        let ema = d[0].c;
        for (let j = 1; j < d.length; j++) ema = (d[j].c * k) + (ema * (1 - k));
        return ema;
      };

      const m9 = calcEMA(dados, 9);
      const m21 = calcEMA(dados, 21);
      
      let gains = 0, losses = 0;
      for (let j = i - 14; j < i; j++) {
        const diff = dados[j + 1].c - dados[j].c;
        diff >= 0 ? gains += diff : losses += Math.abs(diff);
      }
      const rsi14 = 100 - (100 / (1 + (gains / (losses || 1))));

      const sinalCall = m9 > m21 && rsi14 > 50;
      const sinalPut = m9 < m21 && rsi14 < 50;
      const resis = Math.max(...dados.slice(i-20).map(d => d.h));
      const sup = Math.min(...dados.slice(i-20).map(d => d.l));

      // 7.1 FORMATO SINAL EMITIDO
      if (sinalCall || sinalPut) {
        if (lastSinais[ativo.label] !== tempoVela) {
          lastSinais[ativo.label] = tempoVela;
          const circ = sinalCall ? "🟢" : "🔴";
          const msg71 = `${circ} <b>SINAL EMITIDO!</b>\n` +
                        `<b>ATIVO:</b> ${ativo.label}\n` +
                        `<b>SINAL:</b> ${sinalCall ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                        `<b>VELA:</b> ${tempoVela}\n` +
                        `<b>PREÇO:</b> $ ${precoAtual.toFixed(ativo.prec)}\n` +
                        `<b>TP:</b> $ ${sinalCall ? resis.toFixed(ativo.prec) : sup.toFixed(ativo.prec)}\n` +
                        `<b>SL:</b> $ ${sinalCall ? sup.toFixed(ativo.prec) : resis.toFixed(ativo.prec)}`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg71, parse_mode: 'HTML' })
          });
        }
      }

      // 7.2 FORMATO AVISO DE REVERSÃO
      const reversao = (sinalCall && m9 < m21) || (sinalPut && m9 > m21);
      if (reversao && lastSinais[ativo.label] === tempoVela) {
          const msg72 = `⚠️ <b>AVISO DE REVERSÃO</b>\n\n` +
                        `<b>STATUS:</b> <b>TAKE PROFIT!</b>\n` +
                        `<b>ATIVO:</b> ${ativo.label}\n` +
                        `<b>VELA ANTERIOR:</b> ${tempoVela}\n` +
                        `<b>VELA ATUAL:</b> ${horaAtualHHMM}\n` +
                        `<b>PREÇO ATUAL:</b> $ ${precoAtual.toFixed(ativo.prec)}`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg72, parse_mode: 'HTML' })
          });
          delete lastSinais[ativo.label];
      }
    }
  } catch (e) { console.error("Falha no ciclo crítico."); }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title>
    <style>
      body { background-color: #ffffff; color: #000000; font-family: sans-serif; padding: 40px; }
      b { font-weight: bold; }
      .verde { color: #008000; font-weight: bold; }
    </style></head>
    <body>
      <div>_________________________________________________________________</div>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p>&nbsp;</p>
      <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
      <p>&nbsp;</p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <p><b>MERCADO EURUSD:</b> <b>${mercadoStatus}</b></p>
      <div>_________________________________________________________________</div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
