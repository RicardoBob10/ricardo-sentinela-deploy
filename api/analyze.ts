import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Timeout global: responde em 25 segundos (Vercel timeout = 60s)
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(500).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title></head>
        <body style="font-family:sans-serif;padding:20px;">
          <p><b>RICARDO SENTINELA BOT</b></p>
          <p><b>STATUS:</b> <span style="color:orange;">⚠️ TIMEOUT</span></p>
          <p>A análise demorou demais. Tentando novamente em 30 segundos...</p>
          <script>setTimeout(() => location.reload(), 30000);</script>
        </body>
        </html>
      `);
    }
  }, 25000);

  try {
    // ===========================================================================
    // VERSÃO 122.3 - FIXADO PARA VERCEL
    // ===========================================================================
    const versao      = "122.3";
    const dataRevisao = "25/02/2026";
    const horaRevisao = "12:45";
    const token       = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
    const chat_id     = "7625668696";

    const agoraUnix = Date.now();
    const optionsBR = { 
      timeZone: 'America/Sao_Paulo', 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    } as const;
    const horaBR = new Date(agoraUnix).toLocaleTimeString('pt-BR', optionsBR);

    // ===========================================================================
    // FETCHERS COM TIMEOUT RÍGIDO (máx 4 segundos cada)
    // ===========================================================================
    async function fetchComTimeout(url: string, timeout: number = 4000): Promise<any> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const r = await fetch(url, { signal: controller.signal });
        return r.ok ? await r.json() : null;
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // ===========================================================================
    // BTC (KuCoin M5)
    // ===========================================================================
    async function getBTC(): Promise<any[] | null> {
      try {
        const endAt   = Math.floor(Date.now() / 1000);
        const startAt = endAt - 500 * 300;
        const url = `https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=5min&startAt=${startAt}&endAt=${endAt}`;
        const d = await fetchComTimeout(url);
        if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
          return d.data
            .map((v: any) => ({
              t: Number(v[0]) * 1000,
              o: parseFloat(v[1]),
              c: parseFloat(v[2]),
              h: parseFloat(v[3]),
              l: parseFloat(v[4]),
              v: parseFloat(v[5]),
            }))
            .sort((a: any, b: any) => a.t - b.t);
        }
      } catch (_) {}
      return null;
    }

    // ===========================================================================
    // ETH (KuCoin M5)
    // ===========================================================================
    async function getETH(): Promise<any[] | null> {
      try {
        const endAt   = Math.floor(Date.now() / 1000);
        const startAt = endAt - 500 * 300;
        const url = `https://api.kucoin.com/api/v1/market/candles?symbol=ETH-USDT&type=5min&startAt=${startAt}&endAt=${endAt}`;
        const d = await fetchComTimeout(url);
        if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
          return d.data
            .map((v: any) => ({
              t: Number(v[0]) * 1000,
              o: parseFloat(v[1]),
              c: parseFloat(v[2]),
              h: parseFloat(v[3]),
              l: parseFloat(v[4]),
              v: parseFloat(v[5]),
            }))
            .sort((a: any, b: any) => a.t - b.t);
        }
      } catch (_) {}
      return null;
    }

    // ===========================================================================
    // FOREX (Yahoo Finance M5)
    // ===========================================================================
    async function getYahooForex(yahooSymbol: string): Promise<any[] | null> {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=60d`;
        const d = await fetchComTimeout(url);
        const chart = d?.chart?.result?.[0];
        if (chart && chart.timestamp && chart.indicators?.quote?.[0]) {
          return chart.timestamp
            .map((t: number, i: number) => {
              const q = chart.indicators.quote[0];
              return {
                t: t * 1000,
                c: q.close?.[i],
                h: q.high?.[i],
                l: q.low?.[i],
                o: q.open?.[i],
                v: 0
              };
            })
            .filter((v: any) => v.c != null && !isNaN(v.c) && !isNaN(v.t))
            .sort((a: any, b: any) => a.t - b.t);
        }
      } catch (_) {}
      return null;
    }

    // ===========================================================================
    // FUNÇÕES DE CÁLCULO
    // ===========================================================================
    function calcEMA(dados: any[], periodo: number, ate: number): number {
      const k = 2 / (periodo + 1);
      let ema = dados[0].c;
      for (let j = 1; j <= ate; j++) ema = dados[j].c * k + ema * (1 - k);
      return ema;
    }

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

    function calcATR(dados: any[], ate: number, periodo: number = 14): number {
      let trSoma = 0;
      for (let j = ate - periodo + 1; j <= ate; j++) {
        if (j < 1) continue;
        trSoma += Math.max(dados[j].h - dados[j].l, Math.abs(dados[j].h - dados[j-1].c), Math.abs(dados[j].l - dados[j-1].c));
      }
      return trSoma / periodo;
    }

    function calcBollingerBands(dados: any[], ate: number, periodo: number = 20, desvios: number = 2) {
      const slice = dados.slice(Math.max(0, ate - periodo + 1), ate + 1);
      const media = slice.reduce((sum, v) => sum + v.c, 0) / slice.length;
      const variancia = slice.reduce((sum, v) => sum + Math.pow(v.c - media, 2), 0) / slice.length;
      const desvPad = Math.sqrt(variancia);
      return {
        sup: media + desvios * desvPad,
        mid: media,
        inf: media - desvios * desvPad,
      };
    }

    // ===========================================================================
    // SELEÇÃO DE VELA FECHADA (M5)
    // ===========================================================================
    function selecionarVelaFechada(dados: any[]): { vela: any; idx: number } | null {
      const cincoMin = 5 * 60 * 1000;
      for (let i = dados.length - 1; i >= 1; i--) {
        const vela    = dados[i];
        const minVela = new Date(vela.t).getMinutes();
        const diffSeg = (agoraUnix - (vela.t + cincoMin)) / 1000;
        if (minVela % 5 !== 0) continue;
        if (diffSeg < -5) continue;
        if (diffSeg > 180) return null;  // 3 minutos
        return { vela, idx: i };
      }
      return null;
    }

    // ===========================================================================
    // FUNÇÃO DE SCORE SIMPLIFICADA
    // ===========================================================================
    function calcularScore(params: {
      cruzamento: boolean;
      rsiFavoravel: boolean;
      mercadoForte: boolean;
      rompimento: boolean;
      volumeForte: boolean;
      semNoticia: boolean;
    }): number {
      let score = 0;
      if (params.cruzamento)   score += 30;
      if (params.rsiFavoravel) score += 20;
      if (params.mercadoForte) score += 15;
      if (params.rompimento)   score += 15;
      if (params.volumeForte)  score += 10;
      if (params.semNoticia)   score += 10;
      return score;
    }

    // ===========================================================================
    // STATUS FOREX
    // ===========================================================================
    function mercadoForexAberto(): boolean {
      const diaSem = new Date(agoraUnix).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
      const hStr   = new Date(agoraUnix).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
      const [hh, mm] = hStr.split(':').map(Number);
      const minutos  = hh * 60 + mm;
      const dia      = diaSem.toLowerCase();
      
      if (dia.includes('segunda') || dia.includes('terça') || dia.includes('quarta') || dia.includes('quinta')) return true;
      if (dia.includes('sexta'))   return minutos <= 17 * 60;
      if (dia.includes('domingo')) return minutos >= 21 * 60;
      return false;
    }

    // ===========================================================================
    // ANÁLISE PRINCIPAL
    // ===========================================================================
    const logAtivos: string[] = [];
    const ativos = [
      { label: "Bitcoin",  data: await getBTC(),           prec: 2, isForex: false },
      { label: "Ethereum", data: await getETH(),           prec: 2, isForex: false },
      { label: "EUR/USD",  data: await getYahooForex("EURUSD=X"),  prec: 5, isForex: true },
      { label: "USD/JPY",  data: await getYahooForex("USDJPY=X"),  prec: 5, isForex: true },
      { label: "GBP/USD",  data: await getYahooForex("GBPUSD=X"),  prec: 5, isForex: true },
      { label: "AUD/USD",  data: await getYahooForex("AUDUSD=X"),  prec: 5, isForex: true },
      { label: "USD/CAD",  data: await getYahooForex("USDCAD=X"),  prec: 5, isForex: true },
      { label: "USD/CHF",  data: await getYahooForex("USDCHF=X"),  prec: 5, isForex: true },
      { label: "AUD/JPY",  data: await getYahooForex("AUDJPY=X"),  prec: 5, isForex: true },
      { label: "EUR/AUD",  data: await getYahooForex("EURAUD=X"),  prec: 5, isForex: true },
      { label: "EUR/CAD",  data: await getYahooForex("EURCAD=X"),  prec: 5, isForex: true },
      { label: "EUR/CHF",  data: await getYahooForex("EURCHF=X"),  prec: 5, isForex: true },
      { label: "EUR/GBP",  data: await getYahooForex("EURGBP=X"),  prec: 5, isForex: true },
      { label: "EUR/JPY",  data: await getYahooForex("EURJPY=X"),  prec: 5, isForex: true },
      { label: "GBP/AUD",  data: await getYahooForex("GBPAUD=X"),  prec: 5, isForex: true },
      { label: "GBP/JPY",  data: await getYahooForex("GBPJPY=X"),  prec: 5, isForex: true },
    ];

    for (const ativo of ativos) {
      if (!ativo.data || ativo.data.length < 30) {
        logAtivos.push(`[${ativo.label}] ⚠️ Dados insuficientes.`);
        continue;
      }
      if (ativo.isForex && !mercadoForexAberto()) {
        logAtivos.push(`[${ativo.label}] 🔒 Mercado FOREX FECHADO.`);
        continue;
      }

      const resultado = selecionarVelaFechada(ativo.data);
      if (!resultado) {
        logAtivos.push(`[${ativo.label}] ⏳ Fora da janela de disparo.`);
        continue;
      }

      const { vela, idx: i } = resultado;
      const tempoVelaStr = new Date(vela.t).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

      const ema9Atual  = calcEMA(ativo.data, 9,   i);
      const ema21Atual = calcEMA(ativo.data, 21,  i);
      const ema9Prev   = calcEMA(ativo.data, 9,   i - 1);
      const ema21Prev  = calcEMA(ativo.data, 21,  i - 1);
      const rsi        = calcRSI(ativo.data, i, 14);
      const atr        = calcATR(ativo.data, i, 14);
      const bb         = calcBollingerBands(ativo.data, i, 20, 2);

      const cruzouAcima  = (ema9Prev <= ema21Prev) && (ema9Atual > ema21Atual);
      const cruzouAbaixo = (ema9Prev >= ema21Prev) && (ema9Atual < ema21Atual);
      const call = cruzouAcima;
      const put  = cruzouAbaixo;

      if (!call && !put) {
        logAtivos.push(`[${ativo.label}] — Sem cruzamento em ${tempoVelaStr}`);
        continue;
      }

      const rsiFavoravel = call ? (rsi >= 55) : (rsi <= 45);
      const distanciaEMAs = Math.abs(ema9Atual - ema21Atual);
      const mercadoForte  = distanciaEMAs > (atr * 0.35);

      const slice10 = ativo.data.slice(Math.max(0, i - 10), i);
      const rompeuTopo  = call ? (vela.c > Math.max(...slice10.map((v: any) => v.h))) : false;
      const rompeuFundo = put  ? (vela.c < Math.min(...slice10.map((v: any) => v.l))) : false;
      const rompimento  = rompeuTopo || rompeuFundo;

      let volumeForte = true;
      if (!ativo.isForex) {
        const volumeAtual = vela.v || 0;
        const slice20 = ativo.data.slice(Math.max(0, i - 20), i);
        const mediaVolume = slice20.reduce((sum: number, v: any) => sum + (v.v || 0), 0) / slice20.length;
        volumeForte = mediaVolume > 0 && volumeAtual > mediaVolume;
      }

      const score = calcularScore({
        cruzamento: true,
        rsiFavoravel,
        mercadoForte,
        rompimento,
        volumeForte,
        semNoticia: true,
      });

      if (score < 70) {
        logAtivos.push(`[${ativo.label}] ⚠️ Score baixo (${score}/100) em ${tempoVelaStr}.`);
        continue;
      }

      logAtivos.push(`[${ativo.label}] ✅ Sinal válido! Score=${score}/100 em ${tempoVelaStr}`);
    }

    const statusForex = mercadoForexAberto() ? "ABERTO" : "FECHADO";
    
    clearTimeout(timeoutId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title><style>body{background-color:#ffffff;color:#000000;font-family:sans-serif;padding:40px;line-height:1.5;}p{margin:10px 0;font-size:16px;}.verde{color:#008000;font-weight:bold;}.vermelho{color:#cc0000;font-weight:bold;}.log{margin-top:20px;font-size:13px;color:#444;font-family:monospace;max-height:600px;overflow-y:auto;border:1px solid #ddd;padding:10px;}.config{background:#f5f5f5;border-left:4px solid #008000;padding:10px;margin:10px 0;}</style></head>
      <body>
        <p><b>RICARDO SENTINELA BOT</b></p>
        <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
        <p><b>VERSÃO ATUAL:</b> ${versao}</p>
        <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
        <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
        <p><b>HORA ATUAL (BRT):</b> ${horaBR}</p>
        <p><b>MERCADO FOREX:</b> <span class="${statusForex === 'ABERTO' ? 'verde' : 'vermelho'}">${statusForex}</span></p>
        
        <div class="config">
          <p><b>⚙️ CONFIGURAÇÃO V122.3:</b></p>
          <p>TIMEFRAME: <b>M5</b> (5 minutos)</p>
          <p>ATIVOS MONITORADOS: <b>16</b> (Bitcoin, Ethereum, 14 Forex)</p>
          <p>BOLLINGER BANDS: <b>(20, 2)</b></p>
          <p>SCORE MÍNIMO: <b>70/100</b></p>
        </div>
        
        <div class="log"><p><b>LOG DA ÚLTIMA EXECUÇÃO:</b></p>${logAtivos.map(l => `<p>${l}</p>`).join('') || '<p>Aguardando sinais...</p>'}</div>
        <script>setTimeout(() => location.reload(), 30000);</script>
      </body>
      </html>
    `);

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Erro:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title></head>
        <body style="font-family:sans-serif;padding:20px;">
          <p><b>RICARDO SENTINELA BOT</b></p>
          <p><b>VERSÃO:</b> 122.3 (FIXADO)</p>
          <p style="color:#cc0000;"><b>⚠️ ERRO TEMPORÁRIO</b></p>
          <p>Sistema em recuperação. Tentando novamente em 30 segundos...</p>
          <script>setTimeout(() => location.reload(), 30000);</script>
        </body>
        </html>
      `);
    }
  }
}
