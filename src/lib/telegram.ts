import { env } from "@/lib/env";
import { addImage, clearConversation, createDraftItem, createOrReplaceConversation, getConversation, getItem, parsePriceToCents, publishItem, updateItem } from "@/lib/portfolio";
import { storeImage } from "@/lib/storage";
import { sql } from "@/lib/db";

type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  from?: TelegramUser;
  text?: string;
  photo?: Array<{ file_id: string }>;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

async function telegramRequest<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<{ ok: boolean; result: T }>;
}

async function sendMessage(chatId: number, text: string) {
  await telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

async function answerCallbackQuery(callbackQueryId: string, text: string) {
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

async function getTelegramFile(fileId: string) {
  const fileResponse = await telegramRequest<{ file_path: string }>("getFile", { file_id: fileId });
  const filePath = fileResponse.result.file_path;
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Telegram file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function displayAdminName(user: TelegramUser) {
  return user.username ? `@${user.username}` : user.first_name ?? String(user.id);
}

async function handleText(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const from = message.from;
  if (!from) return;
  const conversation = await getConversation(String(chatId));

  if (text === "/start" || text === "/new") {
    if (conversation?.item_id) {
      const existingItem = await getItem(conversation.item_id);
      if (existingItem?.status === "draft") {
        await sql`update portfolio_items set status = 'archived', updated_at = now() where id = ${conversation.item_id};`;
      }
    }
    const draft = await createDraftItem();
    await createOrReplaceConversation({
      chatId: String(chatId),
      adminId: String(from.id),
      itemId: draft.id,
      step: "awaiting_photos",
    });
    await sendMessage(chatId, [
      `Привет, ${displayAdminName(from)}.`,
      "Отправь фото для новой карточки.",
      "Когда закончишь, напиши <b>/done</b>.",
    ].join("\n"));
    return;
  }

  if (!conversation) {
    await sendMessage(chatId, "Напиши /new, чтобы создать новую карточку.");
    return;
  }

  const item = conversation.item_id ? await getItem(conversation.item_id) : null;

  if (text === "/cancel") {
    if (conversation.item_id) {
      const existingItem = await getItem(conversation.item_id);
      if (existingItem?.status === "draft") {
        await sql`update portfolio_items set status = 'archived', updated_at = now() where id = ${conversation.item_id};`;
      }
    }
    await clearConversation(String(chatId));
    await sendMessage(chatId, "Черновик отменён.");
    return;
  }

  if (!item) {
    await sendMessage(chatId, "Напиши /new, чтобы создать новую карточку.");
    return;
  }

  switch (conversation.step) {
    case "awaiting_photos":
      if (text === "/done") {
        const imageCount = await sql`
          select count(*)::text as count from portfolio_item_images where item_id = ${item.id};
        `;
        if (Number((imageCount as { count: string }[])[0]?.count ?? "0") === 0) {
          await sendMessage(chatId, "Сначала отправь хотя бы одну фотографию.");
          return;
        }
        await createOrReplaceConversation({
          chatId: String(chatId),
          adminId: String(from.id),
          itemId: item.id,
          step: "awaiting_title",
        });
        await sendMessage(chatId, "Теперь пришли название товара.");
        return;
      }
      await sendMessage(chatId, "Сначала отправь фото или напиши /done, когда закончишь.");
      return;
    case "awaiting_title":
      await updateItem(item.id, { title: text });
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: item.id,
        step: "awaiting_description",
      });
      await sendMessage(chatId, "Теперь пришли описание.");
      return;
    case "awaiting_description":
      await updateItem(item.id, { description: text });
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: item.id,
        step: "awaiting_size",
      });
      await sendMessage(chatId, "Теперь укажи размер.");
      return;
    case "awaiting_size":
      await updateItem(item.id, { size: text });
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: item.id,
        step: "awaiting_price",
      });
      await sendMessage(chatId, "Теперь пришли цену, например 12500 или 125.00.");
      return;
    case "awaiting_price": {
      const cents = parsePriceToCents(text);
      if (cents === null) {
        await sendMessage(chatId, "Не смог распознать цену. Пришли число, например 12500 или 125.00.");
        return;
      }
      await updateItem(item.id, { price_cents: cents });
      await publishItem(item.id);
      await clearConversation(String(chatId));
      await sendMessage(chatId, "Карточка опубликована.");
      return;
    }
  }
}

async function handlePhoto(message: TelegramMessage) {
  const chatId = message.chat.id;
  const from = message.from;
  const photo = message.photo?.at(-1);
  if (!from || !photo) return;
  const conversation = await getConversation(String(chatId));
  if (!conversation) {
    await sendMessage(chatId, "Сначала напиши /new, чтобы создать карточку.");
    return;
  }
  if (conversation.step !== "awaiting_photos" || !conversation.item_id) {
    await sendMessage(chatId, "Сейчас фото не ожидаются. Напиши /new, чтобы начать новую карточку.");
    return;
  }

  const bytes = await getTelegramFile(photo.file_id);
  const stored = await storeImage(bytes, `${photo.file_id}.jpg`);
  await addImage({
    itemId: conversation.item_id,
    blobUrl: stored.url,
    source: stored.kind,
    telegramFileId: photo.file_id,
  });
  await sendMessage(chatId, "Фото принято. Можешь отправить ещё или написать /done.");
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    await answerCallbackQuery(update.callback_query.id, "Готово");
    return;
  }
  const message = update.message;
  if (!message || !message.from) return;
  if (!message.text && !message.photo) return;
  if (!message.from || !message.from.id) return;
  if (!message.from.username && !message.from.first_name) {
    return;
  }
  if (message.text) {
    await handleText(message, message.text.trim());
    return;
  }
  if (message.photo?.length) {
    await handlePhoto(message);
  }
}
