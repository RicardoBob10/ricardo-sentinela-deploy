
import { Signal } from '../types';

export const DEFAULT_TG_TOKEN = "8223429851:AAGrFgPQSg5CE2cWGLkr_qMMoW0LNbAzPMM";
export const DEFAULT_TG_CHAT_ID = "7625668696";

const isBrowser = typeof window !== 'undefined';

export const requestNotificationPermission = async () => {
  if (isBrowser && 'Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

export const sendBrowserNotification = (signal: Signal) => {
  if (isBrowser && 'Notification' in window && Notification.permission === 'granted') {
    const icon = signal.side === 'BUY' ? '🟢' : '🔴';
    new Notification(`${icon} ${signal.side} Opportunity: ${signal.asset}`, {
      body: `Price: ${signal.price} | TF: ${signal.timeframe}\nConfidence: ${signal.confidence}%\n${signal.reasoning.substring(0, 100)}...`,
      icon: 'https://cdn-icons-png.flaticon.com/512/2533/2533038.png'
    });
  }
};

export const sendTelegramMessage = async (
  token: string,
  chatId: string,
  signal: Signal
) => {
  if (!token || !chatId) return;

  const action = signal.side === 'BUY' ? 'COMPRA (CALL) 🟢' : 'VENDA (PUT) 🔴';

  const message = `🚀 NOVO SINAL - RICARDO TRADER
💹 PAR: ${signal.asset}
📈 AÇÃO: ${action}
⏱️ EXPIRAÇÃO: 15 MIN
ℹ️ MOTIVO: ${signal.reasoning.substring(0, 50)}...`;

  try {
    const url = `https://api.telegram.org/bot${token.trim()}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId.trim(), text: message })
    });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
};

export const sendTelegramHeartbeat = async (token: string, chatId: string) => {
  if (!token || !chatId) return;
  try {
    const url = `https://api.telegram.org/bot${token.trim()}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId.trim(), text: 'Sentinela Ativo 🟢' })
    });
  } catch (error) {
    console.error('Failed to send Heartbeat:', error);
  }
};

export const sendTelegramTest = async (token: string, chatId: string, customMessage?: string) => {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();

  if (!cleanToken || !cleanChatId) return { success: false, error: "Credenciais incompletas" };

  const message = customMessage || `🚀 TESTE DE CONEXÃO - RICARDO TRADER\nSISTEMA DE MONITORAMENTO ATIVO`;

  try {
    const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cleanChatId, text: message })
    });
    return { success: response.ok };
  } catch (error) {
    return { success: false, error: "Falha de rede" };
  }
};
