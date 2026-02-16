import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache para controle de sinais e acompanhamento de reversão
let lastSinais: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const versao = "91";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "18:30"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const agora = new Date();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);
  const horaMinutoInt = parseInt(horaAtualHHMM.replace(':', ''));
  const diaSemana = agora.getDay(); 

  // REGRA DE HORÁRIOS FOREX (ITEM 6)
  const getMercadoStatus = () => {
    if (diaSemana >= 1 && diaSemana <= 4) return "ABERTO";
    if (diaSemana === 5) return horaMinutoInt <= 1900 ? "ABERTO" : "FECHADO";
    if (diaSemana === 0) return horaMinutoInt >= 1901 ? "ABERTO" : "FECHADO";
    return "FECHADO";
  };
  const mercadoStatus = getMercadoStatus();

  // FUNÇÃO DE CASCATA DE APIs (BINANCE > BYBIT > KUCOIN) - AÇÃO CORRETIVA NC 89-1/2
  async function fetchCandles(symbol: string) {
    try {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100`);
      if (r.ok) return await r.json();
    } catch (e) { console.warn("Binance Offline..."); }

    try {
      const r = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=15&limit=100`);
      const j = await r.json();
      if (j.result?.list) return j.result.list.map((v: any) => [v[0], v[1], v[2], v[3], v[4]]);
    } catch (e) { console.warn("Bybit Offline..."); }

    try {
      const r = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=${symbol.replace('USDT', '-USDT')}&type=15min`);
      const j = await r.json();
      if (j.data) return j.data;
    } catch (e) { throw new Error("Falha total nas APIs."); }
  }

  try {
    const ativos = [
      { symbol: "BTCUSDT", label: "Bitcoin", prec: 2, operando: true },
      { symbol: "EURUSDT", label: "EURUSD", prec: 5, operando: mercadoStatus === "ABERTO" }
    ];

    for (const ativo of ativos) {
      if (!ativo.operando) continue;

      const candles = await fetchCandles(ativo.symbol);
      const dados = candles.map((v: any) => ({ t: v[0], c: parseFloat(v[4]), h: parseFloat(v[2]), l: parseFloat(v[3]) }));
      const i = dados.length - 1;
      const precoAtual = dados[i].c;
      const tempoVela = new Date(dados[i].t).toLocaleTimeString('pt-BR', optionsTime);

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

      // 7.1 FORMATO DE MENSAGENS DE COMPRA OU VENDA (REGRA DE OURO)
      if (sinalCall || sinalPut) {
        const opId = `${ativo.label}_${tempoVela}`;
        if (!lastSinais[opId]) {
          lastSinais[opId] = { hora: tempoVela, direcao: sinalCall ? 'alta' : 'baixa' };
          const circulo = sinalCall ? "🟢" : "🔴";
          const msg71 = `<b>${circulo} SINAL EMITIDO!</b>\n` +
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

      // 7.2 FORMATO DE MENSAGENS DE AVISO DE REVERSÃO
      const opAtivaId = Object.keys(lastSinais).find(key => key.startsWith(ativo.label));
      if (opAtivaId) {
        const opAtiva = lastSinais[opAtivaId];
        if ((opAtiva.direcao === 'baixa' && m9 > m21) || (opAtiva.direcao === 'alta' && m9 < m21)) {
          const msg72 = `<b>⚠️AVISO DE REVERSÃO</b>\n\n` +
                        `<b>STATUS:</b> <b>TAKE PROFIT!</b>\n` +
                        `<b>ATIVO:</b> ${ativo.label}\n` +
                        `<b>VELA ANTERIOR:</b> ${opAtiva.hora}\n` +
                        `<b>VELA ATUAL:</b> ${horaAtualHHMM}\n` +
                        `<b>PREÇO ATUAL:</b> $ ${precoAtual.toFixed(ativo.prec)}`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg72, parse_mode: 'HTML' })
          });
          delete lastSinais[opAtivaId];
        }
      }
    }
  } catch (e) { console.error("Erro técnico."); }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title>
    <style>body{background-color:#fff;color:#000;font-family:sans-serif;padding:40px;}b{font-weight:bold;}.verde{color:#008000;font-weight:bold;}</style></head>
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
