// No início da função handler, adicione isto para testar a entrega:
if (req.query.test === 'true') {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            chat_id, 
            text: "✅ **SISTEMA RICARDO SENTINELA ATIVO**\nMonitorando BTC, EUR, GBP e JPY em M15...", 
            parse_mode: 'Markdown' 
        })
    });
}
