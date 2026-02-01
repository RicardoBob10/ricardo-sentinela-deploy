import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    // Lista de ativos para monitoramento simultâneo
    const ativos = ['BTCUSDT', 'EURUSDT'];
    
    for (const ativo of ativos) {
      // Busca dados de mercado da Binance
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo}&interval=15m&limit=40`);
      const candles = await response.json();
      
      // Validação de segurança: evita o erro "candles.map is not a function"
      if (!Array.isArray(candles)) {
        console.error(`Falha ao obter dados para ${ativo}`);
        continue; 
      }

      // Organiza os preços (Inverte para facilitar o cálculo do Fractal [2])
      const highs = candles.map(d => parseFloat(d[2])).reverse();
      const lows = candles.map(d => parseFloat(d[3])).reverse();
      const closes = candles.map(d => parseFloat(d[4])).reverse();

      // --- LÓGICA DO SCRIPT RT_PRO (Sincronizada com a Optnex) ---
      // Fractal de 5 barras
      const fractal_topo = highs[2] > highs[4] && highs[2] > highs[3] && highs[2] > highs[1] && highs[2] > highs[0];
      const fractal_fundo = lows[2] < lows[4] && lows[2] < lows[3] && lows[2] < lows[1] && lows[2] < lows[0];

      // Filtros de confirmação (RSI 9 e Momentum 10)
      const rsi_v = calcularRSI(closes, 9);
      const mtd_subindo = closes[0] > closes[10]; 

      // --- PROCESSAMENTO DO SINAL ---
      if (fractal_fundo || fractal_topo) {
        
        // IA Filtra o sinal baseado em Price Action e Notícias
        const analiseIA = await consultarIA(ativo, closes[0], GEMINI_API_KEY);

        if (analiseIA.aprovado) {
          const direcao = fractal_fundo ? "🟢 ACIMA" : "🔴 ABAIXO";
          
          // Mensagem final enviada ao Telegram
          const mensagem = `🚨 **SINAL: ${direcao}**\n\n📊 **Ativo:** ${ativo}\n⏰ **Expiração:** 10 MIN (Mesma Vela de M15)\n💡 **Filtro IA:** ${analiseIA.motivo}`;
          
          await enviarTelegram(TG_TOKEN, TG_CHAT_ID, mensagem);
        }
      }
    }

    return res.status(200).json({ status: "Sentinela Online e Protegido" });
  } catch (e) {
    // Captura erros globais para evitar queda do sistema
    return res.status(500).json({ erro: e.message });
  }
}

// INTEGRAÇÃO COM A INTELIGÊNCIA ARTIFICIAL (GEMINI)
async function consultarIA(ativo, preco, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const prompt = `Analise o ativo ${ativo} no preço ${preco}. Com base em Price Action (suportes/resistências) e notícias de última hora, valide um sinal técnico. Responda estritamente em JSON: {"aprovado": true, "motivo": "frase curta e direta"}`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) {
    return { aprovado: false, motivo: "Aguardando confirmação de tendência" };
  }
}

// CÁLCULO DO RSI (MESMA LÓGICA DO SEU SCRIPT)
function calcularRSI(closes, p) {
  let ganhos = 0, perdas = 0;
  for (let i = 0; i < p; i++) {
    const d = closes[i] - closes[i+1];
    d > 0 ? ganhos += d : perdas -= d;
  }
  return 100 - (100 / (1 + (ganhos / (perdas || 1))));
}

// ENVIO DE NOTIFICAÇÃO TELEGRAM
async function enviarTelegram(token, chat, msg) {
  const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`;
  await fetch(url);
}
