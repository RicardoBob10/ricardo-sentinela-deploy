import { VercelRequest, VercelResponse } from '@vercel/node';
import WebSocket from 'ws';

// =============================================================================
// TRAVA ANTI-DUPLICIDADE — NC 92-01 [R1 CORRIGIDO]
// =============================================================================
const cacheSinais: Record<string, number> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ===========================================================================
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO — VERSÃO 113
  // ===========================================================================
  const versao      = "113";
  const dataRevisao = "21/02/2026";
  const horaRevisao = "13:42";

  const token   = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const agoraUnix = Date.now();
  const optionsBR = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaBR    = new Date(agoraUnix).toLocaleTimeString('pt-BR', optionsBR);

  // ===========================================================================
  // FETCHER DERIV — única fonte de dados para todos os ativos
  // Substitui: KuCoin, Bybit, TwelveData, Yahoo Finance
  //
  // Vantagem: preços idênticos ao que o sentinela.js executa na Deriv.
  // Zero divergência entre sinal e execução.
  //
  // Símbolo Deriv:
  //   Bitcoin → cryBTCUSD
  //   EURUSD  → frxEURUSD
  //   USDJPY  → frxUSDJPY
  //   GBPUSD  → frxGBPUSD
  //   AUDUSD  → frxAUDUSD
  //   USDCAD  → frxUSDCAD
  //   USDCHF  → frxUSDCHF
  // ===========================================================================
  async function getDerivCandles(symbol: string, count: number = 50): Promise<any[] | null> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1');
      } catch (_) {
        return resolve(null);
      }

      const timeout = setTimeout(() => {
        try { ws.close(); } catch (_) {}
        resolve(null);
      }, 8000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          ticks_history: symbol,
          count,
          end        : 'latest',
          granularity: 900,       // 15 minutos em segundos
          style      : 'candles',
        }));
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.error) {
            clearTimeout(timeout);
            ws.close();
            console.error(`[DERIV] Erro ${symbol}: ${msg.error.message}`);
            return resolve(null);
          }

          if (msg.msg_type === 'candles' && Array.isArray(msg.candles)) {
            clearTimeout(timeout);
            ws.close();
            const candles = msg.candles
              .map((c: any) => ({
                t: c.epoch * 1000,
                o: parseFloat(c.open),
                h: parseFloat(c.high),
                l: parseFloat(c.low),
                c: parseFloat(c.close),
              }))
              .sort((a: any, b: any) => a.t - b.t);
            resolve(candles.length > 0 ? candles : null);
          }
        } catch (_) {
          clearTimeout(timeout);
          try { ws.close(); } catch (_) {}
          resolve(null);
        }
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  // ===========================================================================
  // CONTROLE DE MERCADO FOREX — Item 10 ♦ (REGRA DE OURO)
  // ===========================================================================
  function mercadoForexAberto(): boolean {
    const diaSem = new Date(agoraUnix).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const hStr   = new Date(agoraUnix).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    const [hh, mm] = hStr.split(':').map(Number);
    const minutos  = hh * 60 + mm;
    const dia      = diaSem.toLowerCase();
    if (dia.includes('segunda') || dia.includes('terça') || dia.includes('quarta') || dia.includes('quinta')) return true;
    if (dia.includes('sexta'))   return minutos <= 19 * 60;
    if (dia.includes('domingo')) return minutos >= 19 * 60 + 1;
    return false;
  }

  // ===========================================================================
  // CÁLCULO EMA — Item 9 ♦ RT_ROBO_SCALPER_V3 (REGRA DE OURO)
  // ===========================================================================
  function calcEMA(dados: any[], periodo: number, ate: number): number {
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let j = 1; j <= ate; j++) ema = dados[j].c * k + ema * (1 - k);
    return ema;
  }

  // ===========================================================================
  // CÁLCULO RSI 14 — Item 9 ♦ RT_ROBO_SCALPER_V3 (REGRA DE OURO)
  // ===========================================================================
  function calcRSI(dados: any[], ate: number, periodo: number = 14): number {
    let ganhos = 0, perdas = 0;
    const inicio = ate - periodo;
    if (inicio < 1) return 50;
    for (let j = inicio + 1; j <= ate; j++) {
      const delta = dados[j].c - dados[j - 1].c;
      if (delta > 0) ganhos += delta; else perdas += Math.abs(delta);
    }
    const mediaG = ganhos / periodo;
    const mediaP = perdas / periodo;
    if (mediaP === 0) return 100;
    return 100 - 100 / (1 + mediaG / mediaP);
  }

  // ===========================================================================
  // CÁLCULO ATR — Item 13 ♦ LÓGICA DE CÁLCULO TP E SL VIA ATR (REGRA DE OURO)
  // ===========================================================================
  function calcATR(dados: any[], ate: number, periodo: number = 14): number {
    let trSoma = 0;
    for (let j = ate - periodo + 1; j <= ate; j++) {
      if (j < 1) continue;
      trSoma += Math.max(dados[j].h - dados[j].l, Math.abs(dados[j].h - dados[j-1].c), Math.abs(dados[j].l - dados[j-1].c));
    }
    return trSoma / periodo;
  }

  // ===========================================================================
  // SELEÇÃO DA VELA FECHADA — NC 91-01 / 95-01 [R2 CORRIGIDO]
  // ===========================================================================
  function selecionarVelaFechada(dados: any[]): { vela: any; idx: number } | null {
    const quinzeMin = 15 * 60 * 1000;
    for (let i = dados.length - 1; i >= 1; i--) {
      const vela    = dados[i];
      const minVela = new Date(vela.t).getMinutes();
      const diffSeg = (agoraUnix - (vela.t + quinzeMin)) / 1000;
      if (minVela % 15 !== 0) continue;
      if (diffSeg < -5) continue;
      if (diffSeg > 40) return null;
      return { vela, idx: i };
    }
    return null;
  }

  // ===========================================================================
  // NORMALIZAÇÃO DO ID DE VELA — NC 92-01 [R1 CORRIGIDO]
  // ===========================================================================
  function normalizarIdVela(label: string, ts: number): string {
    const quinzeMin  = 15 * 60 * 1000;
    const janelaNorm = Math.floor(ts / quinzeMin) * quinzeMin;
    return `${label}_${janelaNorm}`;
  }

  // ===========================================================================
  // PROCESSAMENTO PRINCIPAL — V113: DERIV COMO ÚNICA FONTE DE DADOS
  // Todos os 7 ativos buscam candles diretamente da Deriv em paralelo.
  // ===========================================================================
  const logAtivos: string[] = [];

  const ativos = [
    { label: "Bitcoin", symbol: "cryBTCUSD", prec: 2, isForex: false },
    { label: "EURUSD",  symbol: "frxEURUSD",  prec: 5, isForex: true  },
    { label: "USDJPY",  symbol: "frxUSDJPY",  prec: 5, isForex: true  },
    { label: "GBPUSD",  symbol: "frxGBPUSD",  prec: 5, isForex: true  },
    { label: "AUDUSD",  symbol: "frxAUDUSD",  prec: 5, isForex: true  },
    { label: "USDCAD",  symbol: "frxUSDCAD",  prec: 5, isForex: true  },
    { label: "USDCHF",  symbol: "frxUSDCHF",  prec: 5, isForex: true  },
  ];

  // Busca todos os ativos em paralelo para reduzir tempo de execução
  const ativosComDados = await Promise.all(
    ativos.map(async (a) => ({ ...a, data: await getDerivCandles(a.symbol) }))
  );

  for (const ativo of ativosComDados) {

    if (!ativo.data || ativo.data.length < 30) {
      logAtivos.push(`[${ativo.label}] ⚠️ Dados insuficientes (${ativo.data?.length || 0} velas).`);
      continue;
    }
    if (ativo.isForex && !mercadoForexAberto()) {
      logAtivos.push(`[${ativo.label}] 🔒 Mercado FOREX FECHADO.`);
      continue;
    }

    const resultado = selecionarVelaFechada(ativo.data);
    if (!resultado) { logAtivos.push(`[${ativo.label}] ⏳ Fora da janela de disparo (40s).`); continue; }

    const { vela, idx: i } = resultado;
    const dataVela = new Date(vela.t);
    if (isNaN(dataVela.getTime())) { logAtivos.push(`[${ativo.label}] ❌ Timestamp inválido.`); continue; }

    const tempoVelaStr = dataVela.toLocaleTimeString('pt-BR', optionsBR);

    if (i < 22) { logAtivos.push(`[${ativo.label}] ⚠️ Índice insuficiente (idx ${i}).`); continue; }

    const ema9Atual  = calcEMA(ativo.data, 9,  i);
    const ema21Atual = calcEMA(ativo.data, 21, i);
    const ema9Prev   = calcEMA(ativo.data, 9,  i - 1);
    const ema21Prev  = calcEMA(ativo.data, 21, i - 1);
    const rsi        = calcRSI(ativo.data, i, 14);

    const cruzouAcima  = (ema9Prev <= ema21Prev) && (ema9Atual > ema21Atual);
    const cruzouAbaixo = (ema9Prev >= ema21Prev) && (ema9Atual < ema21Atual);
    const call = cruzouAcima  && rsi > 50;
    const put  = cruzouAbaixo && rsi < 50;

    if (!call && !put) {
      logAtivos.push(`[${ativo.label}] — Sem cruzamento em ${tempoVelaStr} | EMA9:${ema9Atual.toFixed(ativo.prec)} EMA21:${ema21Atual.toFixed(ativo.prec)} RSI:${rsi.toFixed(1)}`);
      continue;
    }

    const sinalId = normalizarIdVela(ativo.label, vela.t);
    if (cacheSinais[sinalId]) { logAtivos.push(`[${ativo.label}] 🔁 Vela ${tempoVelaStr} já processada.`); continue; }
    cacheSinais[sinalId] = agoraUnix;

    const atr = calcATR(ativo.data, i, 14);
    const tp  = call ? vela.c + atr * 1.5 : vela.c - atr * 1.5;
    const sl  = call ? vela.c - atr * 2.0 : vela.c + atr * 2.0;

    const msg =
      `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
      `<b>ATIVO:</b> ${ativo.label}\n` +
      `<b>SINAL:</b> ${call ? "↑ COMPRAR" : "↓ VENDER"}\n` +
      `<b>VELA:</b> ${tempoVelaStr}\n` +
      `<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}\n` +
      `<b>TP:</b> $ ${tp.toFixed(ativo.prec)}\n` +
      `<b>SL:</b> $ ${sl.toFixed(ativo.prec)}`;

    // callback_data formato V112+: exec_ATIVO_TIPO_PRECO_TP_SL
    try {
      const tgRes  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          text: msg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '◯ EXECUTAR',
                callback_data: `exec_${ativo.label}_${call ? 'C' : 'V'}_${vela.c.toFixed(ativo.prec)}_${tp.toFixed(ativo.prec)}_${sl.toFixed(ativo.prec)}`
              }
            ]]
          }
        }),
      });
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        logAtivos.push(`[${ativo.label}] ❌ Telegram erro: ${JSON.stringify(tgData)}`);
      } else {
        logAtivos.push(`[${ativo.label}] ✅ ${call ? "COMPRAR" : "VENDER"} enviado — vela ${tempoVelaStr}`);
      }
    } catch (errTg: any) {
      logAtivos.push(`[${ativo.label}] ❌ Falha Telegram: ${errTg?.message}`);
    }
  }

  // ===========================================================================
  // INTERFACE HTML — Item 8 ♦ (REGRA DE OURO — NÃO ALTERAR)
  // ===========================================================================
  const statusForex = mercadoForexAberto() ? "ABERTO" : "FECHADO";
  const logHtml     = logAtivos.map(l => `<p>${l}</p>`).join('\n');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        body      { background-color: #ffffff; color: #000000; font-family: sans-serif; padding: 40px; line-height: 1.5; }
        p         { margin: 10px 0; font-size: 16px; }
        b         { font-weight: bold; }
        .verde    { color: #008000; font-weight: bold; }
        .vermelho { color: #cc0000; font-weight: bold; }
        .log      { margin-top: 20px; font-size: 13px; color: #444; font-family: monospace; }
      </style>
    </head>
    <body>
      <div>_________________________________________________________________</div>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p>&nbsp;</p>
      <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
      <p>&nbsp;</p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <p>&nbsp;</p>
      <p><b>HORA ATUAL (BRT):</b> ${horaBR}</p>
      <p><b>MERCADO FOREX:</b> <span class="${statusForex === 'ABERTO' ? 'verde' : 'vermelho'}">${statusForex}</span></p>
      <p><b>FONTE DE DADOS:</b> <span class="verde">Deriv API (exclusiva)</span></p>
      <p><b>ATIVOS MONITORADOS:</b> Bitcoin, EURUSD, USDJPY, GBPUSD, AUDUSD, USDCAD, USDCHF (7 ativos)</p>
      <div>__________________________________________________________________</div>
      <div class="log">
        <p><b>LOG DA ÚLTIMA EXECUÇÃO:</b></p>
        ${logHtml || '<p>Nenhum evento registrado.</p>'}
      </div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
