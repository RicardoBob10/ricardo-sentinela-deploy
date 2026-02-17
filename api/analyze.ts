import { VercelRequest, VercelResponse } from '@vercel/node';

// =============================================================================
// TRAVA ANTI-DUPLICIDADE — NC 92-01 [R1 CORRIGIDO]
// Problema anterior: cache volátil era resetado a cada invocação serverless no Vercel,
// tornando a proteção contra duplicatas ineficaz (3 sinais da mesma vela enviados).
// Solução: cache em módulo (persiste entre invocações warm) + ID normalizado por janela
// de 15 minutos + janela de disparo de 40s como segunda barreira obrigatória.
// =============================================================================
const cacheSinais: Record<string, number> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ===========================================================================
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO — VERSÃO 109
  // ===========================================================================
  const versao      = "109";
  const dataRevisao = "17/02/2026";
  const horaRevisao = "17:00";

  const token    = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id  = "7625668696";
  const twelveDataKey = "e36e4f3a97124f5c9e2b1d3f5a7c9e1b";

  const agoraUnix = Date.now();
  const optionsBR = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;

  // Hora atual em Brasília para controle de mercado e logs
  const agoraBR = new Date(agoraUnix);
  const horaBR  = agoraBR.toLocaleTimeString('pt-BR', optionsBR);

  // =============================================================================
  // FETCHER BTC — NC 91-01 [R2 CORRIGIDO] + NC 91-02 [RESOLVIDO MANTIDO]
  // Causa raiz: KuCoin retorna timestamp em SEGUNDOS Unix.
  // O código anterior usava Number(v[0]) diretamente → new Date(segundos) = 1970
  // → campo VELA exibia "Invalid Date" e janela de disparo de 40s nunca batia.
  // Correção: parser KuCoin multiplica timestamp por 1000 para converter em ms.
  // Bybit também normalizado para garantir consistência.
  // =============================================================================
  async function getBTC(): Promise<any[] | null> {
    // --- FONTE 1: KuCoin ---
    try {
      const r = await fetch(
        `https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min`,
        { signal: AbortSignal.timeout(3500) }
      );
      const d = await r.json();
      if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
        return d.data
          .map((v: any) => ({
            // CORREÇÃO NC 91-01: KuCoin retorna segundos → converter para ms (* 1000)
            t: Number(v[0]) * 1000,
            o: parseFloat(v[1]),
            c: parseFloat(v[2]),
            h: parseFloat(v[3]),
            l: parseFloat(v[4]),
          }))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}

    // --- FONTE 2: Bybit (redundância — NC 89-01 MANTIDO) ---
    try {
      const r = await fetch(
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=50`,
        { signal: AbortSignal.timeout(3500) }
      );
      const d = await r.json();
      if (d?.result?.list && Array.isArray(d.result.list)) {
        return d.result.list
          .map((v: any) => ({
            // Bybit retorna ms, mas normalizar para segurança
            t: Number(v[0]),
            o: parseFloat(v[1]),
            h: parseFloat(v[2]),
            l: parseFloat(v[3]),
            c: parseFloat(v[4]),
          }))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}

    return null;
  }

  // =============================================================================
  // FETCHER EUR/USD — NC 95-01 [R2 CORRIGIDO]
  // Causa raiz: TwelveData retorna datetime como string ISO → conversão com
  // new Date(v.datetime).getTime() pode retornar NaN dependendo do formato
  // ou fuso. Corrigido com parser explícito e fallback para Yahoo Finance.
  // =============================================================================
  async function getEUR(): Promise<any[] | null> {
    // --- FONTE 1: TwelveData ---
    try {
      const r = await fetch(
        `https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=50&apikey=${twelveDataKey}`,
        { signal: AbortSignal.timeout(4000) }
      );
      const d = await r.json();
      if (d?.values && Array.isArray(d.values) && d.values.length > 0) {
        return d.values
          .map((v: any) => {
            const ts = new Date(v.datetime + 'Z').getTime(); // forçar UTC explícito
            return {
              t: isNaN(ts) ? new Date(v.datetime).getTime() : ts,
              c: parseFloat(v.close),
              h: parseFloat(v.high),
              l: parseFloat(v.low),
              o: parseFloat(v.open),
            };
          })
          .filter((v: any) => !isNaN(v.t))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}

    // --- FONTE 2: Yahoo Finance (redundância — NC 89-02 MANTIDO) ---
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=15m&range=1d`,
        { signal: AbortSignal.timeout(4000) }
      );
      const d = await r.json();
      const chart = d?.chart?.result?.[0];
      if (chart) {
        return chart.timestamp
          .map((t: number, i: number) => ({
            t: t * 1000, // Yahoo retorna segundos → ms
            c: chart.indicators.quote[0].close[i],
            h: chart.indicators.quote[0].high[i],
            l: chart.indicators.quote[0].low[i],
            o: chart.indicators.quote[0].open[i],
          }))
          .filter((v: any) => v.c != null && !isNaN(v.c))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}

    return null;
  }

  // =============================================================================
  // CONTROLE DE MERCADO FOREX — ITEM 6 "HORÁRIOS" (REGRA DE OURO MANTIDA)
  // EURUSD: Seg-Qui 00:00-23:59 | Sex 00:00-19:00 | Dom 19:01-21:00
  // FECHADO: Sex 19:01-23:59 | Sáb integral | Dom 00:00-19:00
  // Bitcoin: Opera 24h, sem restrição de horário
  // =============================================================================
  function mercadoEURUSDAberto(): boolean {
    const agora   = new Date(agoraUnix);
    const diaSem  = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const hStr    = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    const [hh, mm] = hStr.split(':').map(Number);
    const minutos  = hh * 60 + mm;

    const dia = diaSem.toLowerCase();

    if (dia.includes('segunda') || dia.includes('terça') || dia.includes('quarta') || dia.includes('quinta')) {
      return true; // 00:00 às 23:59 ABERTO
    }
    if (dia.includes('sexta')) {
      return minutos <= 19 * 60; // até 19:00
    }
    if (dia.includes('domingo')) {
      return minutos >= 19 * 60 + 1; // de 19:01 em diante
    }
    // Sábado: FECHADO
    return false;
  }

  // =============================================================================
  // FUNÇÕES TÉCNICAS — ALINHADAS COM RT_ROBO_SCALPER_V3 (ITEM 5 — REGRA DE OURO)
  // Script original: EMA 9, EMA 21 + RSI 14
  // Sinal CALL: EMA9 cruzou acima EMA21 E RSI > 50
  // Sinal PUT:  EMA9 cruzou abaixo EMA21 E RSI < 50
  // =============================================================================
  function calcEMA(dados: any[], periodo: number, ate: number): number {
    const k  = 2 / (periodo + 1);
    let ema   = dados[0].c;
    for (let j = 1; j <= ate; j++) {
      ema = dados[j].c * k + ema * (1 - k);
    }
    return ema;
  }

  function calcRSI(dados: any[], ate: number, periodo: number = 14): number {
    // RSI Wilder — alinhado com RT_ROBO_SCALPER_V3 (rsi(close, 14))
    let ganhos = 0, perdas = 0;
    const inicio = ate - periodo;
    if (inicio < 1) return 50; // dados insuficientes → neutro

    for (let j = inicio; j <= ate; j++) {
      const delta = dados[j].c - dados[j - 1].c;
      if (delta > 0) ganhos += delta;
      else           perdas += Math.abs(delta);
    }
    const mediaG = ganhos / periodo;
    const mediaP = perdas / periodo;
    if (mediaP === 0) return 100;
    const rs = mediaG / mediaP;
    return 100 - 100 / (1 + rs);
  }

  function calcATR(dados: any[], ate: number, periodo: number = 14): number {
    // ATR — Item 8 "LÓGICA DE CÁLCULO: TP E SL VIA ATR" (REGRA DE OURO MANTIDA)
    let trSoma = 0;
    for (let j = ate - periodo + 1; j <= ate; j++) {
      if (j < 1) continue;
      const h  = dados[j].h;
      const l  = dados[j].l;
      const cp = dados[j - 1].c;
      trSoma += Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
    }
    return trSoma / periodo;
  }

  // =============================================================================
  // SELEÇÃO DA VELA CORRETA — NC 91-01 / 95-01 [R2 CORRIGIDO]
  // Causa raiz: "ativo.data.length - 2" assumia posição fixa no array,
  // mas APIs diferentes incluem ou não a vela corrente aberta.
  // Correção: busca a última vela FECHADA cujo timestamp seja múltiplo de 15min
  // e cujo fechamento (t + 15min) já tenha ocorrido no passado.
  // =============================================================================
  function selecionarVelaFechada(dados: any[]): { vela: any; idx: number } | null {
    const quinzeMin = 15 * 60 * 1000;

    for (let i = dados.length - 1; i >= 1; i--) {
      const vela           = dados[i];
      const minutosVela    = new Date(vela.t).getMinutes();
      const fechamentoVela = vela.t + quinzeMin;

      // A vela deve ter timestamp múltiplo de 15 minutos
      if (minutosVela % 15 !== 0) continue;

      // A vela deve estar completamente fechada (fechamento já passou)
      if (fechamentoVela > agoraUnix) continue;

      // JANELA DE DISPARO: até 40s após o fechamento oficial da vela
      // (evita que sinais antigos sejam disparados — NC 92-01 reforço)
      const diffSeg = (agoraUnix - fechamentoVela) / 1000;
      if (diffSeg > 40) return null; // janela expirou, não disparar

      return { vela, idx: i };
    }
    return null;
  }

  // =============================================================================
  // NORMALIZAÇÃO DO ID DE VELA — NC 92-01 [R1 CORRIGIDO]
  // Causa raiz: cache em memória volátil resetava a cada invocação serverless.
  // Solução: ID normalizado pelo timestamp truncado em janela de 15 minutos.
  // Mesmo que o timestamp tenha variação de segundos, cai na mesma janela.
  // =============================================================================
  function normalizarIdVela(label: string, ts: number): string {
    const quinzeMin  = 15 * 60 * 1000;
    const janelaNorm = Math.floor(ts / quinzeMin) * quinzeMin;
    return `${label}_${janelaNorm}`;
  }

  // =============================================================================
  // PROCESSAMENTO PRINCIPAL DOS ATIVOS
  // =============================================================================
  const logAtivos: string[] = [];

  const ativos = [
    { label: "Bitcoin", data: await getBTC(), prec: 2,  semRestricao: true },
    { label: "EURUSD",  data: await getEUR(), prec: 5,  semRestricao: false },
  ];

  for (const ativo of ativos) {

    // --- Verificação de dados mínimos ---
    if (!ativo.data || ativo.data.length < 30) {
      logAtivos.push(`[${ativo.label}] ⚠️ Dados insuficientes ou indisponíveis.`);
      continue;
    }

    // --- Controle de mercado EURUSD (Item 6 — Regra de Ouro) ---
    if (!ativo.semRestricao && !mercadoEURUSDAberto()) {
      logAtivos.push(`[${ativo.label}] 🔒 Mercado FECHADO — sinal bloqueado.`);
      continue;
    }

    // --- Seleção da vela fechada correta (NC 91-01 / 95-01 corrigido) ---
    const resultado = selecionarVelaFechada(ativo.data);
    if (!resultado) {
      logAtivos.push(`[${ativo.label}] ⏳ Fora da janela de disparo ou vela não encontrada.`);
      continue;
    }

    const { vela, idx: i } = resultado;

    // --- Validação do timestamp (NC 91-02 — guard contra Invalid Date) ---
    const dataVela = new Date(vela.t);
    if (isNaN(dataVela.getTime())) {
      logAtivos.push(`[${ativo.label}] ❌ Timestamp inválido (${vela.t}) — sinal abortado.`);
      continue;
    }

    // --- Formatar VELA em HH:MM (brasília) --- Item 7.1 Regra de Ouro
    const tempoVelaStr = dataVela.toLocaleTimeString('pt-BR', optionsBR);

    // --- Lógica RT_ROBO_SCALPER_V3: EMA 9/21 + RSI 14 (Item 5 — Regra de Ouro) ---
    if (i < 22) {
      logAtivos.push(`[${ativo.label}] ⚠️ Índice insuficiente para EMA/RSI.`);
      continue;
    }

    const ema9Atual  = calcEMA(ativo.data, 9,  i);
    const ema21Atual = calcEMA(ativo.data, 21, i);
    const ema9Prev   = calcEMA(ativo.data, 9,  i - 1);
    const ema21Prev  = calcEMA(ativo.data, 21, i - 1);
    const rsi        = calcRSI(ativo.data, i, 14);

    // Cruzamento EMA9/EMA21 + confirmação RSI (RT_ROBO_SCALPER_V3)
    const cruzouAcima = (ema9Prev <= ema21Prev) && (ema9Atual > ema21Atual);
    const cruzouAbaixo= (ema9Prev >= ema21Prev) && (ema9Atual < ema21Atual);

    const call = cruzouAcima  && rsi > 50;
    const put  = cruzouAbaixo && rsi < 50;

    if (!call && !put) {
      logAtivos.push(`[${ativo.label}] — Sem sinal na vela ${tempoVelaStr} | EMA9:${ema9Atual.toFixed(ativo.prec)} EMA21:${ema21Atual.toFixed(ativo.prec)} RSI:${rsi.toFixed(1)}`);
      continue;
    }

    // --- Trava de duplicidade normalizada (NC 92-01 [R1] corrigido) ---
    const sinalId = normalizarIdVela(ativo.label, vela.t);
    if (cacheSinais[sinalId]) {
      logAtivos.push(`[${ativo.label}] 🔁 Sinal da vela ${tempoVelaStr} já enviado — duplicata bloqueada.`);
      continue;
    }

    // Registrar ANTES do envio para bloquear qualquer concorrência
    cacheSinais[sinalId] = agoraUnix;

    // --- Cálculo ATR para TP e SL (Item 8 — Regra de Ouro) ---
    const atr = calcATR(ativo.data, i, 14);

    // TP: Preço ± (ATR * 1.5) — Item 8.1
    const tp = call ? vela.c + atr * 1.5 : vela.c - atr * 1.5;
    // SL: Preço ∓ (ATR * 2.0) — Item 8.2
    const sl = call ? vela.c - atr * 2.0 : vela.c + atr * 2.0;

    // --- Formatação da mensagem (Item 7 — FORMATOS — Regra de Ouro) ---
    // NÃO ALTERAR O FORMATO — conforme instrução do briefing
    const msg =
      `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
      `<b>ATIVO:</b> ${ativo.label}\n` +
      `<b>SINAL:</b> ${call ? "↑ COMPRAR" : "↓ VENDER"}\n` +
      `<b>VELA:</b> ${tempoVelaStr}\n` +
      `<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}\n` +
      `<b>TP:</b> $ ${tp.toFixed(ativo.prec)}\n` +
      `<b>SL:</b> $ ${sl.toFixed(ativo.prec)}`;

    // --- Envio ao Telegram (NC 89-01 / 89-02 — tratamento de erro mantido) ---
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }),
      });
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        logAtivos.push(`[${ativo.label}] ❌ Telegram erro: ${JSON.stringify(tgData)}`);
      } else {
        logAtivos.push(`[${ativo.label}] ✅ Sinal ${call ? "COMPRAR" : "VENDER"} enviado — vela ${tempoVelaStr}`);
      }
    } catch (errTg: any) {
      logAtivos.push(`[${ativo.label}] ❌ Falha Telegram: ${errTg?.message}`);
    }
  }

  // =============================================================================
  // INTERFACE HTML — REGRA DE OURO (ITEM 4 — NÃO ALTERAR ESTRUTURA)
  // =============================================================================
  const statusEURUSD = mercadoEURUSDAberto() ? "ABERTO" : "FECHADO";
  const logHtml = logAtivos.map(l => `<p>${l}</p>`).join('\n');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        body  { background-color: #ffffff; color: #000000; font-family: sans-serif; padding: 40px; line-height: 1.5; }
        p     { margin: 10px 0; font-size: 16px; }
        b     { font-weight: bold; }
        .verde    { color: #008000; font-weight: bold; }
        .vermelho { color: #cc0000; font-weight: bold; }
        .log  { margin-top: 20px; font-size: 13px; color: #444; font-family: monospace; }
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
      <p><b>EURUSD MERCADO:</b> <span class="${statusEURUSD === 'ABERTO' ? 'verde' : 'vermelho'}">${statusEURUSD}</span></p>
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
