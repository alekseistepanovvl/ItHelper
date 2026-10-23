export async function sendTelegramMessage(config, message, logger) {
  if (!config.telegramEnabled) {
    logger.info("Telegram notification skipped (dry run)", {
      message
    });
    return;
  }

  logger.info("Sending Telegram notification", {
    chatId: config.telegramChatId,
    messageLength: message.length
  });
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text: message,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API returned ${response.status}: ${body}`);
  }

  logger.info("Telegram notification accepted", {
    status: response.status
  });
}
