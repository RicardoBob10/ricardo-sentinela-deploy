import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache global para evitar reincidência de sinais na mesma vela
let lastSinais: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ATUALIZAÇÃO PARA VERSÃO 90 - FOCO EM ELIMINAR NCs REINCIDENTES
  const versao = "90";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "18:20"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const agora = new Date();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);
  const horaMinutoInt = parseInt(horaAtualHHMM.replace(':', ''));
  const diaSemana = agora.getDay(); 

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

      const resApi = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=100`);
      const candles = await resApi.json();
      if (!Array.isArray(candles)) continue;

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
      
      // Cálculo Preciso RSI 14 (Ação Corretiva NC 90-2)
      let gains = 0, losses = 0;
      for (let j = i - 14; j < i; j++) {
        const diff = dados[j + 1].c - dados[j].c;
        diff >= 0 ? gains += diff : losses += Math.abs(diff);
      }
      const rs = gains / (losses || 1);
      const rsi14 = 100 - (100 / (1 + rs));

      const sinalCall = m9 > m21 && rsi14 > 50;
      const sinalPut = m9 < m21 && rsi14 < 50;

      const resis = Math.max(...dados.slice(i-20).map(d => d.h));
      const sup = Math.min(...dados.slice(i-20).map(d => d.l));

      // 7.1 FORMATO DE MENSAGENS DE COMPRA OU VENDA (RIGOR TOTAL)
      if (sinalCall || sinalPut) {
        const opId = `${ativo.label}_${tempoVela}`; // ID único por vela para evitar falha de envio
        if (!lastSinais[opId]) {
          lastSinais[opId] = { hora: tempoVela, direcao: sinalCall ? 'alta' : 'baixa', ativo: ativo.label };
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

      // 7.2 FORMATO DE MENSAGENS DE AVISO DE REVERSÃO
      const opAtivaId = Object.keys(lastSinais).find(key => key.startsWith(ativo.label));
      if (opAtivaId) {
        const opAtiva = lastSinais[opAtivaId];
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
          delete lastSinais[opAtivaId];
        }
      }
    }
  } catch (e) { console.error("Erro."); }

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
      <div>_________________________________________________________________</div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
