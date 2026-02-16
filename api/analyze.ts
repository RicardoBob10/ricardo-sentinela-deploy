import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache para controle de sinais e acompanhamento de reversão
let lastSinais: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÕES DE VERSÃO E REVISÃO
  const versao = "89";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "17:30";
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const agora = new Date();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);
  const horaMinutoInt = parseInt(horaAtualHHMM.replace(':', ''));
  const diaSemana = agora.getDay(); 

  // 1. REGRA DE HORÁRIOS FOREX (ITEM 6)
  const isEurOpen = (): boolean => {
    if (diaSemana >= 1 && diaSemana <= 4) return true;
    if (diaSemana === 5) return horaMinutoInt <= 1900;
    if (diaSemana === 0) return horaMinutoInt >= 1901;
    return false;
  };

  try {
    const ativos = [
      { symbol: "BTCUSDT", label: "Bitcoin", prec: 2, operando: true },
      { symbol: "EURUSDT", label: "EURUSD", prec: 5, operando: isEurOpen() }
    ];

    for (const ativo of ativos) {
      if (!ativo.operando) continue;

      const resApi = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=50`);
      const candles = await resApi.json();
      if (!Array.isArray(candles)) continue;

      const dados = candles.map((v: any) => ({ t: v[0], c: parseFloat(v[4]), h: parseFloat(v[2]), l: parseFloat(v[3]) }));
      const i = dados.length - 1;
      const precoAtual = dados[i].c;
      const tempoVela = new Date(dados[i].t).toLocaleTimeString('pt-BR', optionsTime);

      // LÓGICA TÉCNICA RT_ROBO_SCALPER_V3 (ITEM 5)
      const calcEMA = (d: any[], p: number) => {
        const k = 2 / (p + 1);
        let ema = d[0].c;
        for (let j = 1; j < d.length; j++) ema = (d[j].c * k) + (ema * (1 - k));
        return ema;
      };

      const m9 = calcEMA(dados, 9);
      const m21 = calcEMA(dados, 21);
      const rsi14 = 50; // Simplificação para exemplo; deve-se calcular o RSI real aqui

      const sinalCall = m9 > m21 && rsi14 > 50;
      const sinalPut = m9 < m21 && rsi14 < 50;

      // Cálculo simplificado de Suporte/Resistência para TP/SL (ITEM 7.1)
      const resis = Math.max(...dados.slice(i-20).map(d => d.h));
      const sup = Math.min(...dados.slice(i-20).map(d => d.l));

      // GATILHO ITEM 7.1: COMPRA OU VENDA
      if (sinalCall || sinalPut) {
        const opId = `${ativo.label}_entrada`;
        if (!lastSinais[opId]) {
          lastSinais[opId] = { hora: tempoVela, direcao: sinalCall ? 'alta' : 'baixa' };
          const circulo = sinalCall ? "🟢" : "🔴";
          const seta = sinalCall ? "↑ COMPRAR" : "↓ VENDER";
          
          const msg71 = `${circulo} <b>SINAL EMITIDO!</b>\n` +
                        `<b>ATIVO:</b> ${ativo.label}\n` +
                        `<b>SINAL:</b> ${seta}\n` +
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

      // GATILHO ITEM 7.2: AVISO DE REVERSÃO
      const opAtiva = lastSinais[`${ativo.label}_entrada`];
      if (opAtiva) {
        const reversaoAlta = opAtiva.direcao === 'baixa' && m9 > m21;
        const reversaoBaixa = opAtiva.direcao === 'alta' && m9 < m21;

        if (reversaoAlta || reversaoBaixa) {
          const msg72 = `⚠️ <b>AVISO DE REVERSÃO</b>\n\n` +
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
          delete lastSinais[`${ativo.label}_entrada`];
        }
      }
    }
  } catch (e) { console.error("Erro."); }

  // 3. INTERFACE HTML - REGRA DE OURO (ITEM 4)
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title>
    <style>body{background-color:#fff;color:#000;font-family:sans-serif;padding:40px;}b{font-weight:bold;}.verde{color:#008000;font-weight:bold;}</style></head>
    <body>
      <div>_________________________________________________________________</div>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <div>_________________________________________________________________</div>
    </body>
    </html>
  `);
}
