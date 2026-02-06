import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "RT-PRO-V7-MULTI-SOURCE";
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const ATIVOS = [
    { 
      symbol: "BTCUSDT", 
      label: "BTCUSD", 
      source: "binance",
      url: "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100"
    },
    { 
      symbol: "EURUSD", 
      label: "EURUSD", 
      source: "fxpractice",
      url: "https://api-fxpractice.oanda.com/v3/instruments/EUR_USD/candles?count=100&granularity=M1"
    },
    { 
      symbol: "GBPUSD", 
      label: "GBPUSD", 
      source: "fxpractice",
      url: "https://api-fxpractice.oanda.com/v3/instruments/GBP_USD/candles?count=100&granularity=M1"
    },
    { 
      symbol: "USDJPY", 
      label: "USDJPY", 
      source: "fxpractice",
      url: "https://api-fxpractice.oanda.com/v3/instruments/USD_JPY/candles?count=100&granularity=M1"
    }
  ];

  try {
    for (const ativo of ATIVOS) {
      let candles: any[] = [];

      try {
        const response = await fetch(ativo.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });

        if (!response.ok) {
          console.log(`Erro ao buscar ${ativo.label}: ${response.status}`);
          continue;
        }

        const json = await response.json();

        if (ativo.source === "binance") {
          if (!Array.isArray(json) || json.length < 60) continue;
          
          candles = json.map((k: any) => ({
            t: parseInt(k[0]) / 1000,
            o: parseFloat(k[1]),
            h: parseFloat(k[2]),
            l: parseFloat(k[3]),
            c: parseFloat(k[4]),
            v: parseFloat(k[5])
          }));
        } else if (ativo.source === "fxpractice") {
          if (!json.candles || json.candles.length < 60) continue;
          
          candles = json.candles.map((k: any) => ({
            t: new Date(k.time).getTime() / 1000,
            o: parseFloat(k.mid.o),
            h: parseFloat(k.mid.h),
            l: parseFloat(k.mid.l),
            c: parseFloat(k.mid.c),
            v: parseFloat(k.volume || 0)
          }));
        }

      } catch (err) {
        console.log(`Erro ao processar ${ativo.label}:`, err);
        continue;
      }

      if (candles.length < 60) continue;

      // ========================================
      // CÁLCULOS EXATOS DO RT_PRO
      // ========================================

      const calcEMA = (data: number[], period: number): number[] => {
        const k = 2 / (period + 1);
        const ema: number[] = [];
        ema[0] = data[0];
        
        for (let i = 1; i < data.length; i++) {
          ema[i] = data[i] * k + ema[i - 1] * (1 - k);
        }
        return ema;
      };

      const calcRSI = (closes: number[], period: number): number[] => {
        const rsi: number[] = [];
        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 1; i <= period; i++) {
          const change = closes[i] - closes[i - 1];
          if (change > 0) avgGain += change;
          else avgLoss -= change;
        }
        avgGain /= period;
        avgLoss /= period;

        rsi[period] = 100 - (100 / (1 + avgGain / (avgLoss || 0.0001)));

        for (let i = period + 1; i < closes.length; i++) {
          const change = closes[i] - closes[i - 1];
          avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
          avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
          rsi[i] = 100 - (100 / (1 + avgGain / (avgLoss || 0.0001)));
        }
        return rsi;
      };

      const calcDiNapoliStoch = (candles: any[], fk: number, sk: number, sd: number) => {
        const fastK: number[] = [];
        const slowK: number[] = [];
        const slowD: number[] = [];

        for (let i = fk - 1; i < candles.length; i++) {
          const slice = candles.slice(i - fk + 1, i + 1);
          const lowest = Math.min(...slice.map((v: any) => v.l));
          const highest = Math.max(...slice.map((v: any) => v.h));
          fastK[i] = ((candles[i].c - lowest) / (highest - lowest || 1)) * 100;
        }

        slowK[fk - 1] = fastK[fk - 1];
        const k_mult = 2 / (sk + 1);
        for (let i = fk; i < candles.length; i++) {
          slowK[i] = fastK[i] * k_mult + slowK[i - 1] * (1 - k_mult);
        }

        slowD[fk - 1] = slowK[fk - 1];
        const d_mult = 2 / (sd + 1);
        for (let i = fk; i < candles.length; i++) {
          slowD[i] = slowK[i] * d_mult + slowD[i - 1] * (1 - d_mult);
        }

        return { slowK, slowD };
      };

      // Processar indicadores
      const closes = candles.map((v: any) => v.c);
      const highs = candles.map((v: any) => v.h);
      const lows = candles.map((v: any) => v.l);

      const ema_rapida = calcEMA(closes, 12);
      const ema_lenta = calcEMA(closes, 26);
      const linha_macd = ema_rapida.map((v, i) => v - ema_lenta[i]);
      const linha_sinal_macd = calcEMA(linha_macd, 9);

      const rsi_values = calcRSI(closes, 9);
      const momentum = closes.map((v, i) => i >= 10 ? v - closes[i - 10] : 0);
      const { slowK: stoch_k, slowD: stoch_d } = calcDiNapoliStoch(candles, 14, 3, 3);

      // Análise da vela [2]
      const idx_atual = candles.length - 1;
      const idx_sinal = idx_atual - 2;

      if (idx_sinal < 4) continue;

      // FRACTAL
      const fractal_topo = 
        highs[idx_sinal] > highs[idx_sinal - 2] &&
        highs[idx_sinal] > highs[idx_sinal - 1] &&
        highs[idx_sinal] > highs[idx_sinal + 1] &&
        highs[idx_sinal] > highs[idx_atual];

      const fractal_fundo = 
        lows[idx_sinal] < lows[idx_sinal - 2] &&
        lows[idx_sinal] < lows[idx_sinal - 1] &&
        lows[idx_sinal] < lows[idx_sinal + 1] &&
        lows[idx_sinal] < lows[idx_atual];

      // CONDIÇÕES
      const macd_acima = linha_macd[idx_sinal] > linha_sinal_macd[idx_sinal];
      const macd_abaixo = linha_macd[idx_sinal] < linha_sinal_macd[idx_sinal];

      const rsi_subindo = rsi_values[idx_sinal] > rsi_values[idx_sinal - 1];
      const rsi_descendo = rsi_values[idx_sinal] < rsi_values[idx_sinal - 1];

      const stoch_alta = stoch_k[idx_sinal] > stoch_d[idx_sinal];
      const stoch_baixa = stoch_k[idx_sinal] < stoch_d[idx_sinal];

      const momentum_subindo = momentum[idx_sinal] > momentum[idx_sinal - 1];
      const momentum_descendo = momentum[idx_sinal] < momentum[idx_sinal - 1];

      // SINAL COMPLETO
      const sinal_call = fractal_fundo && macd_acima && rsi_subindo && stoch_alta && momentum_subindo;
      const sinal_put = fractal_topo && macd_abaixo && rsi_descendo && stoch_baixa && momentum_descendo;

      let sinalStr = "";
      if (sinal_call) sinalStr = "ACIMA";
      if (sinal_put) sinalStr = "ABAIXO";

      if (sinalStr) {
        const sid = `${ativo.label}_${sinalStr}_${Math.floor(candles[idx_sinal].t / 60)}`;
        
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;

          const velaHora = new Date(candles[idx_sinal].t * 1000).toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit'
          });

          const msg = `🚨 **SINAL RT_PRO CONFIRMADO**\n\n` +
                      `📊 **ATIVO**: ${ativo.label}\n` +
                      `📍 **ORDEM**: ${sinalStr === "ACIMA" ? "🟢 CALL (COMPRA)" : "🔴 PUT (VENDA)"}\n` +
                      `🕐 **HORÁRIO**: ${velaHora}\n` +
                      `⏱ **EXPIRAÇÃO**: M5\n` +
                      `💹 **PREÇO**: ${candles[idx_sinal].c.toFixed(ativo.label === 'BTCUSD' ? 2 : 5)}\n\n` +
                      `✅ Fractal + MACD + RSI + Stoch + Momentum alinhados`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id,
              text: msg,
              parse_mode: 'Markdown'
            })
          });

          console.log(`✅ Sinal enviado: ${ativo.label} - ${sinalStr} às ${velaHora}`);
        }
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <title>RICARDO SENTINELA BOT</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 700px;
      width: 100%;
    }
    h1 {
      color: #667eea;
      text-align: center;
      margin-bottom: 10px;
      font-size: 28px;
    }
    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .alert {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 20px;
      text-align: center;
      font-weight: bold;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .status-card {
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }
    .status-card.active {
      background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }
    .status-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .status-value {
      font-size: 20px;
      font-weight: bold;
      color: #333;
    }
    .indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4ade80;
      display: inline-block;
      margin-right: 8px;
      box-shadow: 0 0 10px #4ade80;
      animation: blink 1s infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 RICARDO SENTINELA BOT</h1>
    <p class="subtitle">MONITORAMENTO ATIVO M1</p>
    
    <div class="alert">
      ⚡ AUTO-REFRESH A CADA 60 SEGUNDOS
    </div>
    
    <div class="status-grid">
      <div class="status-card active">
        <div class="status-label">BTC/USD</div>
        <div class="status-value"><span class="indicator"></span>ATIVO</div>
      </div>
      <div class="status-card active">
        <div class="status-label">EUR/USD</div>
        <div class="status-value"><span class="indicator"></span>ATIVO</div>
      </div>
      <div class="status-card active">
        <div class="status-label">GBP/USD</div>
        <div class="status-value"><span class="indicator"></span>ATIVO</div>
      </div>
      <div class="status-card active">
        <div class="status-label">USD/JPY</div>
        <div class="status-value"><span class="indicator"></span>ATIVO</div>
      </div>
      <div class="status-card">
        <div class="status-label">DATA</div>
        <div class="status-value">${dataHora.split(',')[0]}</div>
      </div>
      <div class="status-card">
        <div class="status-label">HORA</div>
        <div class="status-value">${dataHora.split(',')[1]}</div>
      </div>
      <div class="status-card">
        <div class="status-label">VERSÃO</div>
        <div class="status-value">${versao}</div>
      </div>
      <div class="status-card active">
        <div class="status-label">STATUS</div>
        <div class="status-value"><span class="indicator"></span>ONLINE</div>
      </div>
    </div>
  </div>
</body>
</html>`);

  } catch (e) {
    console.error("Erro crítico:", e);
    return res.status(200).send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="10"><title>Reconectando...</title></head>
<body style="display:flex;justify-content:center;align-items:center;min-height:100vh;background:#667eea;color:white;font-family:Arial;">
  <div style="text-align:center;">
    <h1>⏳ RECONECTANDO...</h1>
    <p>Tentando novamente em 10 segundos...</p>
  </div>
</body>
</html>`);
  }
}
