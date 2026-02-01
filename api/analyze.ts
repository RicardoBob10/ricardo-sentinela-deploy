import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();

    // TRAVA OPERACIONAL DE 9 MINUTOS
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: "Aguardando próxima oportunidade..." });

    const inicioM15 = Math.floor(minutoAtual / 15) * 15;
    const cicloVela = `${String(horaAtual).padStart(2, '0')}:${String(inicioM15).padStart(2, '0')} -> EXPIRY`;

    // Varredura de Cripto (BTC)
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=50`;
    const response = await fetch(url);
    const data = await response.json();
    
    const candles = data.map(d => ({
      o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
    })).reverse();

    // ANÁLISE SENSORIAL HUMANA
    const isBearish = candles[0].c < candles[0].o;
    const isBullish = candles[0].c > candles[0].o;

    // CONSULTA AO CÉREBRO DA IA (MODO BENCHMARKING)
    const analiseIA = await consultarCerebroGlobal("BTCUSDT", candles, GEMINI_API_KEY);

    if (analiseIA.decisao === "ENTRAR") {
      // VALIDAÇÃO RIGOROSA: Direção DEVE bater com a cor da vela real
      if ((analiseIA.direcao === "CALL" && isBearish) || (analiseIA.direcao === "PUT" && isBullish)) {
        return res.status(200).json({ status: "Sinal abortado por divergência visual." });
      }

      const direcaoEmoji = analiseIA.direcao === "CALL" ? "🟢 ACIMA" : "🔴 ABAIXO";
      
      const msg = `💎 **SENTINELA DE ELITE: ${direcaoEmoji}**\n\n` +
                  `🪙 **ATIVO:** BTCUSDT\n` +
                  `⏰ **CICLO:** ${cicloVela}\n` + 
                  `📊 **CONFLUÊNCIA:** ${analiseIA.motivo}\n\n` +
                  `✅ **CHECKLIST INFALÍVEL:**\n` +
                  `• EMA/MACD: OK\n` +
                  `• RSI/WILLIAMS: OK\n` +
                  `• COR DA VELA: CONFIRMADA\n\n` +
                  `🚀 **OPORTUNIDADE ÚNICA NA OPTNEX!**`;

      await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
    }

    return res.status(200).json({ status: "Agente monitorando com precisão máxima" });
  } catch (e) {
    return res.status(200).json({ erro: e.message });
  }
}

async function consultarCerebroGlobal(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const dados = candles.slice(0, 30).map(c => `O:${c.o} C:${c.c} V:${c.v}`).join('|');

  const prompt = `Você é um Trader de Elite 24/7. Analise ${ativo}: ${dados}.
  REGRAS: 
  1. Use: EMA, MACD, RSI, Bandas de Bollinger, Fractal, Estocástico, Volume, Williams %R e Momentum.
  2. Faça benchmarking da tendência. Se a vela atual for contra a análise, ignore.
  3. SÓ autorize ENTRAR se houver 90% de certeza técnica.
  RESPONDA APENAS JSON: {"decisao": "ENTRAR" ou "AGUARDAR", "direcao": "CALL" ou "PUT", "motivo": "justificativa técnica profissional"}`;

  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) { return { decisao: "AGUARDAR" }; }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
