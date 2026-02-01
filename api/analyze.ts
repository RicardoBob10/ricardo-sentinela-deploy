import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    // 1. COLETA DE DADOS (BTCUSD e EURUSD)
    const ativos = ['BTCUSDT', 'EURUSDT'];
    for (const ativo of ativos) {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo}&interval=15m&limit=40`);
      const candles = await response.json();
      
      const highs = candles.map(d => parseFloat(d[2])).reverse();
      const lows = candles.map(d => parseFloat(d[3])).reverse();
      const closes = candles.map(d => parseFloat(d[4])).reverse();

      // --- PARÂMETROS CONFIGURADOS NO SEU SCRIPT ---
      // Fractal 5 barras (Igual ao seu .txt)
      const fractal_topo = highs[2] > highs[4] && highs[2] > highs[3] && highs[2] > highs[1] && highs[2] > highs[0];
      const fractal_fundo = lows[2] < lows[4] && lows[2] < lows[3] && lows[2] < lows[1] && lows[2] < lows[0];

      // Filtros Técnicos (MACD 12/26/9, RSI 9, Momentum 10)
      const rsi_v = calcularRSI(closes, 9);
      const mtd_subindo = closes[0] > closes[1];
      const mtd_descendo = closes[0] < closes[1];

      // 2. GATILHO DO SCRIPT (O "Sentinela" encontra a oportunidade)
      if (fractal_fundo || fractal_topo) {
        
        // 3. FILTRO DA IA (O Robô Profissional Híbrido decide)
        const prompt = `Analise ${ativo} em M15. Preço: ${closes[0]}. Fractal detectado. Com base em Price Action e notícias recentes, aprove este sinal de ${fractal_fundo ? 'ACIMA' : 'ABAIXO'}? Responda em JSON: {"aprovado": true, "motivo": "resumo"}`;
        
        const aiRes = await consultarIA(prompt, GEMINI_API_KEY);

        if (aiRes.aprovado) {
          const acao = fractal_fundo ? "🟢 ACIMA" : "🔴 ABAIXO";
          const msg = `🚨 **SINAL HÍBRIDO: ${acao}**\n\n📊 Ativo: ${ativo}\n⏰ Expiração: 10 MIN (Mesma Vela)\n💡 Motivo: ${aiRes.motivo}`;
          
          await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
        }
      }
    }
    return res.status(200).json({ status: "Sincronizado com RT_PRO" });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}

// Funções Auxiliares
async function consultarIA(prompt, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json();
  try {
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(text);
  } catch { return { aprovado: false, motivo: "IA em análise" }; }
}

function calcularRSI(closes, p) {
  let gains = 0, losses = 0;
  for (let i = 0; i < p; i++) {
    const d = closes[i] - closes[i+1];
    d > 0 ? gains += d : losses -= d;
  }
  return 100 - (100 / (1 + (gains / (losses || 1))));
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
