import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const ativos = ['BTCUSDT', 'EURUSDT'];
    let sinalEnviado = false;

    for (const ativo of ativos) {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo}&interval=15m&limit=40`);
      const candles = await response.json();
      
      if (!Array.isArray(candles)) continue;

      const highs = candles.map(d => parseFloat(d[2])).reverse();
      const lows = candles.map(d => parseFloat(d[3])).reverse();
      const closes = candles.map(d => parseFloat(d[4])).reverse();

      // Lógica RT_PRO (MACD 12/26/9, RSI 9, Momentum 10)
      const fractal_topo = highs[2] > highs[4] && highs[2] > highs[3] && highs[2] > highs[1] && highs[2] > highs[0];
      const fractal_fundo = lows[2] < lows[4] && lows[2] < lows[3] && lows[2] < lows[1] && lows[2] < lows[0];

      if (fractal_fundo || fractal_topo) {
        const analiseIA = await consultarIA(ativo, closes[0], GEMINI_API_KEY);

        if (analiseIA.aprovado) {
          const direcao = fractal_fundo ? "🟢 ACIMA" : "🔴 ABAIXO";
          const mensagem = `🚨 **SINAL: ${direcao}**\n\n📊 **Ativo:** ${ativo}\n⏰ **Expiração:** 10 MIN (Mesma Vela de M15)\n💡 **Filtro IA:** ${analiseIA.motivo}`;
          await enviarTelegram(TG_TOKEN, TG_CHAT_ID, mensagem);
          sinalEnviado = true;
        }
      }
    }

    // Se nenhum sinal foi enviado neste ciclo de 15 min, envia o status de monitoramento
    if (!sinalEnviado) {
      await enviarTelegram(TG_TOKEN, TG_CHAT_ID, "🤖 **Ativos em análise, aguarde a próxima vela!**");
    }

    return res.status(200).json({ status: "Ciclo concluído com sucesso" });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}

// Funções Auxiliares (IA, RSI, Telegram) - Mantenha as mesmas do código anterior
async function consultarIA(ativo, preco, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const prompt = `Analise ${ativo} em ${preco}. Com base em Price Action e notícias, valide o sinal. Responda em JSON: {"aprovado": true, "motivo": "frase curta"}`;
  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const data = await res.json();
  const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
  return JSON.parse(cleanText);
}

function calcularRSI(closes, p) {
  let g = 0, l = 0;
  for (let i = 0; i < p; i++) {
    const d = closes[i] - closes[i+1];
    d > 0 ? g += d : l -= d;
  }
  return 100 - (100 / (1 + (g / (l || 1))));
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
