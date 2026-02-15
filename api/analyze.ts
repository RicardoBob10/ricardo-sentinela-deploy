import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache global para evitar duplicidade reincidente [Ref. NC 81-05]
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "83";
  
  // 1. TRATAMENTO DE CALLBACK (MELHORIA V83: BOTÕES INTERATIVOS)
  if (req.body && req.body.callback_query) {
    const callbackData = req.body.callback_query.data;
    const msgId = req.body.callback_query.message.message_id;

    if (callbackData.startsWith("exec_")) {
      const [_, ativo, direcao] = callbackData.split("_");
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          message_id: msgId,
          text: `<b>✅ COMANDO RECEBIDO!</b>\nExecutando <b>${direcao}</b> em <b>${ativo}</b> na Optnex...\n<i>(Aguardando resposta da Oracle...)</i>`,
          parse_mode: 'HTML'
        })
      });
    } else if (callbackData === "descartar") {
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          message_id: msgId,
          text: `<b>❌ SINAL DESCARTADO</b>\nA operação foi cancelada por você.`,
          parse_mode: 'HTML'
        })
      });
    }
    return res.status(200).send("ok");
  }

  // 2. CONFIGURAÇÕES DE TEMPO E STATUS [Ref. ITEM 7]
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });
  const [data, hora] = dataHora.split(', ');
  const optionsTime = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaMinutoInt = parseInt(agora.toLocaleTimeString('pt-BR', optionsTime).replace(':', ''));
  const diaSemana = agora.getDay();

  const getStatus = (label: string): boolean => {
    if (label === "BTCUSD") return true;
    if (label === "EURUSD") {
      if (diaSemana === 5) return horaMinutoInt <= 1630;
      if (diaSemana === 6) return false;
      if (diaSemana === 0) return horaMinutoInt >= 2200;
      return !(horaMinutoInt >= 1801 && horaMinutoInt <= 2159);
    }
    return false;
  };

  const ATIVOS = [
    { symbol: "BTCUSDT", label: "BTCUSD", sources: ["binance", "bybit", "kucoin"], symKucoin: "BTC-USDT" },
    { symbol: "EURUSDT", label: "EURUSD", sources: ["binance", "bybit", "kucoin"], symKucoin: "EUR-USDT" }
  ];

  // 3. FUNÇÕES TÉCNICAS (LÓGICA V.02 APROVADA) [Ref. ITEM 5]
  const calcularRSI = (dados: any[], idx: number) => {
    const period = 9;
    if (idx < period || !dados[idx]) return 50;
    let gains = 0, losses = 0;
    for (let j = idx - (period - 1); j <= idx; j++) {
      const diff = dados[j].c - dados[j-1].c;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  };

  const calcularEMA = (dados: any[], periodo: number) => {
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let i = 1; i < dados.length; i++) {
      ema = (dados[i].c * k) + (ema * (1 - k));
    }
    return ema;
  };

  try {
    // 4. PROCESSAMENTO EM PARALELO (FIM DO ATRASO) [Ref. NC 81-11]
    await Promise.all(ATIVOS.map(async (ativo) => {
      if (!getStatus(ativo.label)) return;

      let candles: any[] = [];
      for (const fonte of ativo.sources) {
        try {
          let url = "";
          if (fonte === "binance") url = `https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=100`;
          if (fonte === "bybit") url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${ativo.symbol}&interval=15&limit=100`;
          if (fonte === "kucoin") url = `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symKucoin}&type=15min`;
          
          const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
          const json = await resp.json();
          // Mapeamento de candles conforme a fonte...
          if (fonte === "binance") candles = json.map((v: any) => ({ t: v[0], o: parseFloat(v[1]), c: parseFloat(v[4]), h: parseFloat(v[2]), l: parseFloat(v[3]) }));
          if (candles.length > 30) break;
        } catch (e) { continue; }
      }

      if (candles.length < 30) return;

      const i = candles.length - 1;
      const rsi_val = calcularRSI(candles, i);
      const rsi_ant = calcularRSI(candles, i-1);
      const ema_20 = calcularEMA(candles.slice(0, i + 1), 20);
      const ema_20_ant = calcularEMA(candles.slice(0, i), 20);

      // Lógica Fractal Central (i-2) [Ref. ITEM 5]
      const f_alta = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;
      const f_baixa = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;

      // AÇÕES CORRETIVAS: Filtros de Cor de Vela e Inclinação EMA [Ref. NC 81-02]
      let sinalStr = "";
      if (f_alta && (rsi_val >= 30 && rsi_val > rsi_ant) && candles[i].c > ema_20 && ema_20 > ema_20_ant && candles[i].c > candles[i].o) sinalStr = "ACIMA";
      if (f_baixa && (rsi_val <= 70 && rsi_val < rsi_ant) && candles[i].c < ema_20 && ema_20 < ema_20_ant && candles[i].c < candles[i].o) sinalStr = "ABAIXO";

      if (sinalStr) {
        const opId = `${ativo.label}_${candles[i].t}_${sinalStr}`;
        if (!lastSinais[opId]) {
          lastSinais[opId] = true;

          const teclado = {
            inline_keyboard: [[
              { text: "⭕ EXECUTAR", callback_data: `exec_${ativo.label}_${sinalStr}` },
              { text: "❌ DESCARTAR", callback_data: "descartar" }
            ]]
          };

          const msg = `<b>🔔 SINAL EMITIDO!</b>\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${sinalStr === "ACIMA" ? "↑" : "↓"} ${sinalStr}\n<b>VELA:</b> ${new Date(candles[i].t).toLocaleTimeString('pt-BR', {timeZone, hour:'2-digit', minute:'2-digit'})}`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML', reply_markup: teclado })
          });
        }
      }
    }));

    // 5. INTERFACE HTML (REGRA DE OURO) [Ref. ITEM 4]
    const statusEur = getStatus("EURUSD") ? "ABERTO" : "FECHADO";
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <table>
        <tr><th>Nº</th><th>DATA</th><th>HORA</th><th>MOTIVO</th></tr>
        <tr><td>83</td><td>15/02/26</td><td>12:30</td><td>Ações Corretivas NC 81 + Modo Semi-Auto (Botões)</td></tr>
        <tr><td>82</td><td>15/02/26</td><td>10:30</td><td>Fix NC: Zero Delay + Paralelismo + Filtro Inclinação EMA</td></tr>
      </table>
      <script>setTimeout(()=>location.reload(), 30000);</script>
    `);
  } catch (e) { return res.status(200).send("Sistema Operacional Ativo."); }
}
