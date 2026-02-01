
# RICARDO TRADER - AI SENTINEL 🚀

Este projeto está configurado para rodar análises de Opções Binárias automaticamente a cada 15 minutos via Vercel Cron Jobs.

## Como finalizar o Deploy:

1. **GitHub**: Faça o push deste código para o seu repositório `ricardo-sentinela-deploy`.
2. **Vercel**: Importe o projeto no painel da Vercel.
3. **Environment Variables**: No painel da Vercel, vá em *Settings > Environment Variables* e adicione:
   - `API_KEY`: Sua chave do Google Gemini API.
4. **Cron Jobs**: O arquivo `vercel.json` já habilita o agendamento automático. Após o primeiro deploy, a função `/api/analyze` será chamada a cada 15 minutos (00, 15, 30, 45).

## Tecnologias:
- Frontend: React + Tailwind + Lightweight Charts
- Backend: Vercel Serverless Functions (Node.js)
- AI: Google Gemini 3 Flash
- Notificações: Telegram Bot API
