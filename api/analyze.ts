import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();

    // TRAVA DE 9 MINUTOS: Respeita o limite operacional da Optnex
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: "Aguardando próxima vela M15..." });

    const inicioM15 = Math.floor(minutoAtual / 15) * 15;
    const fimM15 = (inicioM15 + 15) % 60;
    const horaFim = fimM15 === 0 ? (horaAtual + 1) % 24 : horaAtual;
    const cicloVela = `${String(horaAtual).padStart(2, '0')}:${String(inicioM15).padStart(2, '0')} -> ${String(horaFim).padStart(2, '0')}:${String(fimM15).padStart(2, '0')}`;

    const ativos = [{ nome: 'BTCUSDT', operarFimDeSemana: true }];

    for (const ativo of ativos) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=50`;
      const response = await fetch(url);
      const data = await response.json();
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
      })).reverse();

      // CALIBRAGEM VISUAL: O robô agora "vê" a cor e a força da vela atual
      const isBearish = candles[0].c < candles[0].o;
      const isBullish = candles[0].c > candles[0].o;
      const corpoVela = Math.abs(candles[0].c - candles[0].o);

      const analiseIA = await consultarAgenteHumano(ativo.nome, candles, GEMINI_API_KEY);

      if (analiseIA.decisao === "ENTRAR") {
        // FILTRO ANTI-DOIDO: Bloqueia sinal de COMPRA em vela VERMELHA forte e vice-versa
        if (analiseIA.direcao === "CALL" && isBearish) continue; 
        if (analiseIA.direcao === "PUT" && isBullish) continue;

        const direcao = analiseIA.direcao === "CALL" ? "🟢 ACIMA" : "🔴 ABAIXO";
        const notaExtra = analiseIA.tipo === "IA" ? "\n⚠️ *Nota: Oportunidade identificada pela análise técnica da IA.*" : "";

        const msg = `🚨 **SINAL CONFIRMADO: ${direcao}**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `⏰ **VELA (M15):** ${cicloVela}\n` + 
                    `📊 **ANÁLISE TÉCNICA:** ${analiseIA.motivo}\n` +
                    `${notaExtra}\n\n` +
                    `🚀 **EXECUTAR NA OPTNEX!**`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }
    return res.status(200).json({ status: "Agente Calibrado e Ativo" });
  } catch (e) {
    return res.status(200).json({ erro: e.message });
  }
}

async function consultarAgenteHumano(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const dados = candles.slice(0, 25).map(c => `O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v}`).join('|');

  const prompt = `Aja como um Trader Humano Senior. Analise ${ativo} (M15): ${dados}.
  REQUISITOS: 
  1. Analise Candlesticks (Cor, Pavio, Corpo).
  2. Use: EMA(9,21), MACD, RSI, Bandas de Bollinger, Fractal, Estocástico, Volume e Williams %R.
  3. Identifique Suporte/Resistência e Tendência real.
  4. SÓ responda ENTRAR se a direção bater com a COR da vela atual.
  Responda APENAS JSON: {"decisao": "ENTRAR" ou "AGUARDAR", "direcao": "CALL" ou "PUT", "motivo": "resumo técnico curto", "tipo": "IA"}`;

  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) {
    return { decisao: "AGUARDAR" };
  }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
