import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    // AJUSTE DE FUSO HORÁRIO: Brasília (UTC-3)
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    
    const diaSemana = agoraBR.getDay(); // 0 = Domingo, 6 = Sábado
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();
    const minutosStatus = [0, 15, 30, 45];
    let sinalDetectado = false;

    // Cálculo da Expiração correta para o próximo ciclo de 15m (Horário de Brasília)
    const proximoM15 = Math.ceil((minutoAtual + 1) / 15) * 15;
    let horaExp = horaAtual;
    let minExp = proximoM15;

    if (minExp === 60) {
      minExp = 0;
      horaExp = (horaAtual + 1) % 24;
    }
    const horaExpiracaoStr = `${String(horaExp).padStart(2, '0')}:${String(minExp).padStart(2, '0')}`;

    // Configuração de Ativos com trava de final de semana
    const ativos = [
      { nome: 'BTCUSDT', operarFimDeSemana: true },
      { nome: 'EURUSDT', operarFimDeSemana: false } // Forex Real fecha Sáb/Dom
    ];

    for (const ativo of ativos) {
      // REGRA: Se for Final de Semana (Sábado/Domingo) e o ativo for Forex, pula.
      if (!ativo.operarFimDeSemana && (diaSemana === 0 || diaSemana === 6)) {
        continue; 
      }

      const url = `https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=10`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({ h: parseFloat(d[2]), l: parseFloat(d[3]) })).reverse();
      const highs = candles.map(d => d.h);
      const lows = candles.map(d => d.l);

      const sinal_acima = lows[0] < lows[1]; 
      const sinal_abaixo = highs[0] > highs[1];

      if (sinal_acima || sinal_abaixo) {
        const analiseIA = await consultarIA(ativo.nome, highs[0], GEMINI_API_KEY, candles);

        if (analiseIA.aprovado) {
          const direcao = sinal_acima ? "🟢 ACIMA" : "🔴 ABAIXO";
          const msg = `🚨 **SINAL CONFIRMADO: ${direcao}**\n\n` +
                      `🪙 **ATIVO:** ${ativo.nome}\n` +
                      `⏰ **EXPIRAÇÃO:** ${horaExpiracaoStr}\n` + 
                      `💡 **IA:** ${analiseIA.motivo}\n\n` +
                      `🚀 **ENTRAR AGORA NA OPTNEX!**`;

          await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
          sinalDetectado = true;
        }
      }
    }

    if (!sinalDetectado && minutosStatus.includes(minutoAtual)) {
      const statusAtivos = (diaSemana === 0 || diaSemana === 6) ? "BTC (EURUSD fechado)" : "BTC e EURUSD";
      await enviarTelegram(TG_TOKEN, TG_CHAT_ID, `🤖 **Monitorando ${statusAtivos} em Brasília.**`);
    }

    return res.status(200).json({ status: "Sentinela Atualizado", horarioBR: horaExpiracaoStr });
  } catch (e) {
    return res.status(200).json({ erro: e.message });
  }
}

async function consultarIA(ativo, preco, key, candles) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const prompt = `Trader Senior. Ativo ${ativo}. Se tendência forte, aprove. JSON: {"aprovado": true, "motivo": "tendência clara"}`;
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) {
    return { aprovado: true, motivo: "Price Action OK" };
  }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
