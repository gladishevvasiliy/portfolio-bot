import { env } from "@/lib/env";
import {
  addImage,
  clearConversation,
  createDraftItem,
  createOrReplaceConversation,
  getConversation,
  getItem,
  getManageableItems,
  parsePriceToCents,
  publishItem,
  updateItem,
} from "@/lib/portfolio";
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

type ReplyKeyboardMarkup = {
  keyboard: string[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
};

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

const BUTTONS = {
  newItem: "➕ Новая карточка",
  editItem: "✏️ Редактировать",
  currentDraft: "📋 Текущий черновик",
  help: "ℹ️ Помощь",
  home: "🏠 Меню",
  done: "✅ Фото готовы",
  cancel: "🗑 Отменить",
  back: "↩️ Назад",
} as const;

const CALLBACKS = {
  newItem: "menu:new",
  editItem: "menu:edit",
  currentDraft: "menu:draft",
  help: "menu:help",
  home: "menu:home",
  done: "flow:done",
  cancel: "flow:cancel",
  back: "flow:back",
} as const;

function mainMenuMarkup(): ReplyKeyboardMarkup {
  return {
    keyboard: [[BUTTONS.newItem], [BUTTONS.editItem], [BUTTONS.currentDraft, BUTTONS.help]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Выбери действие",
  };
}

function draftMarkup(step: string): ReplyKeyboardMarkup {
  const rows = step === "awaiting_photos"
    ? [[BUTTONS.done], [BUTTONS.cancel, BUTTONS.home]]
    : [[BUTTONS.back], [BUTTONS.cancel, BUTTONS.home]];

  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Следующий шаг",
  };
}

function editingPhotosMarkup(): ReplyKeyboardMarkup {
  return {
    keyboard: [[BUTTONS.done], [BUTTONS.back, BUTTONS.home], [BUTTONS.cancel]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Добавляй фото",
  };
}

function menuMessage(user: TelegramUser) {
  return [
    `Привет, ${displayAdminName(user)}.`,
    "Это меню управления портфолио.",
    "Выбери действие кнопкой ниже.",
  ].join("\n");
}

function helpMessage() {
  return [
    "Как пользоваться:",
    `• ${BUTTONS.newItem} - создать новую карточку.`,
    `• ${BUTTONS.editItem} - редактировать существующую карточку.`,
    `• ${BUTTONS.currentDraft} - посмотреть текущий черновик.`,
    `• ${BUTTONS.done} - перейти к следующему шагу после фото.`,
    `• ${BUTTONS.cancel} - отменить текущий черновик.`,
    `• ${BUTTONS.home} - вернуться в главное меню.`,
  ].join("\n");
}

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

async function sendMessage(chatId: number, text: string, replyMarkup?: ReplyKeyboardMarkup | InlineKeyboardMarkup) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  await telegramRequest("sendMessage", payload);
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

async function archiveCurrentDraft(conversation: Awaited<ReturnType<typeof getConversation>> | null) {
  if (!conversation?.item_id) return;
  const existingItem = await getItem(conversation.item_id);
  if (existingItem?.status === "draft") {
    await sql`update portfolio_items set status = 'archived', updated_at = now() where id = ${conversation.item_id};`;
  }
}

async function sendMainMenu(chatId: number, user: TelegramUser) {
  await sendMessage(chatId, menuMessage(user), mainMenuMarkup());
}

async function openNewDraft(chatId: number, from: TelegramUser, previousConversation: Awaited<ReturnType<typeof getConversation>> | null) {
  await archiveCurrentDraft(previousConversation);
  const draft = await createDraftItem();
  await createOrReplaceConversation({
    chatId: String(chatId),
    adminId: String(from.id),
    itemId: draft.id,
    step: "awaiting_photos",
  });
  await sendMessage(
    chatId,
    [
      `Привет, ${displayAdminName(from)}.`,
      "Отправь фото для новой карточки.",
      `Когда закончишь, нажми <b>${BUTTONS.done}</b>.`,
    ].join("\n"),
    draftMarkup("awaiting_photos"),
  );
}

function itemStatusLabel(status: string) {
  if (status === "published") return "опубликована";
  if (status === "draft") return "черновик";
  return status;
}

function trimInlineText(value: string, maxLength = 34) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function editItemKeyboard(items: Awaited<ReturnType<typeof getManageableItems>>) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const item of items) {
    const label = trimInlineText(item.title || `Карточка ${item.id.slice(0, 8)}`);
    rows.push([
      {
        text: `${label} · ${itemStatusLabel(item.status)}`,
        callback_data: `edit:item:${item.id}`,
      },
    ]);
  }
  return { inline_keyboard: rows };
}

function editFieldKeyboard(itemId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Название", callback_data: `edit:field:${itemId}:title` },
        { text: "Описание", callback_data: `edit:field:${itemId}:description` },
      ],
      [
        { text: "Размер", callback_data: `edit:field:${itemId}:size` },
        { text: "Цена", callback_data: `edit:field:${itemId}:price` },
      ],
      [{ text: "Фото", callback_data: `edit:field:${itemId}:photos` }],
      [{ text: "Меню", callback_data: CALLBACKS.home }],
    ],
  };
}

async function showCurrentDraft(chatId: number, from: TelegramUser, conversation: Awaited<ReturnType<typeof getConversation>> | null) {
  if (!conversation?.item_id) {
    await sendMessage(chatId, "Текущей карточки нет.", mainMenuMarkup());
    return;
  }

  const item = await getItem(conversation.item_id);
  if (!item) {
    await sendMessage(chatId, "Карточка не найдена. Можно создать новую.", mainMenuMarkup());
    return;
  }

  const statusLabel =
    conversation.step === "awaiting_photos" ? "жду фото" :
    conversation.step === "awaiting_title" ? "жду название" :
    conversation.step === "awaiting_description" ? "жду описание" :
    conversation.step === "awaiting_size" ? "жду размер" :
    conversation.step === "awaiting_price" ? "жду цену" :
    conversation.step === "editing_select_field" ? "редактирование карточки" :
    conversation.step === "editing_title" ? "редактирую название" :
    conversation.step === "editing_description" ? "редактирую описание" :
    conversation.step === "editing_size" ? "редактирую размер" :
    conversation.step === "editing_price" ? "редактирую цену" :
    "редактирую фото";

  await sendMessage(
    chatId,
    [
      `Текущая карточка для ${displayAdminName(from)}.`,
      `Статус: <b>${statusLabel}</b>.`,
      "Можно продолжить с этого места или открыть новое меню.",
    ].join("\n"),
    conversation.step.startsWith("editing_") ? editFieldKeyboard(item.id) : draftMarkup(conversation.step),
  );
}

async function showEditItemList(chatId: number) {
  const items = await getManageableItems();
  if (items.length === 0) {
    await sendMessage(chatId, "Пока нет карточек для редактирования.", mainMenuMarkup());
    return;
  }

  await sendMessage(chatId, "Выбери карточку, которую хочешь изменить:", editItemKeyboard(items));
}

async function startEditingItem(chatId: number, from: TelegramUser, itemId: string, previousConversation: Awaited<ReturnType<typeof getConversation>> | null) {
  await archiveCurrentDraft(previousConversation);
  const item = await getItem(itemId);
  if (!item) {
    await sendMessage(chatId, "Карточка не найдена.", mainMenuMarkup());
    return;
  }

  await createOrReplaceConversation({
    chatId: String(chatId),
    adminId: String(from.id),
    itemId: item.id,
    step: "editing_select_field",
  });

  await sendMessage(
    chatId,
    [
      `Редактируем: <b>${item.title || "без названия"}</b>.`,
      "Выбери поле, которое нужно изменить.",
    ].join("\n"),
    editFieldKeyboard(item.id),
  );
}

async function returnToEditFields(chatId: number, from: TelegramUser, itemId: string) {
  await createOrReplaceConversation({
    chatId: String(chatId),
    adminId: String(from.id),
    itemId,
    step: "editing_select_field",
  });
  await sendMessage(chatId, "Что меняем дальше?", editFieldKeyboard(itemId));
}

async function cancelCurrentDraft(chatId: number, conversation: Awaited<ReturnType<typeof getConversation>> | null) {
  await archiveCurrentDraft(conversation);
  await clearConversation(String(chatId));
  await sendMessage(chatId, "Черновик отменён.", mainMenuMarkup());
}

async function handleText(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const from = message.from;
  if (!from) return;
  const conversation = await getConversation(String(chatId));

  if (text === "/start" || text === BUTTONS.home || text === "/menu") {
    await sendMainMenu(chatId, from);
    return;
  }

  if (text === BUTTONS.newItem || text === "/new") {
    await openNewDraft(chatId, from, conversation);
    return;
  }

  if (text === BUTTONS.editItem || text === "/edit") {
    await showEditItemList(chatId);
    return;
  }

  if (text === BUTTONS.currentDraft) {
    await showCurrentDraft(chatId, from, conversation);
    return;
  }

  if (text === BUTTONS.help || text === "/help") {
    await sendMessage(chatId, helpMessage(), mainMenuMarkup());
    return;
  }

  if (!conversation) {
    await sendMainMenu(chatId, from);
    return;
  }

  const item = conversation.item_id ? await getItem(conversation.item_id) : null;

  if (text === BUTTONS.cancel || text === "/cancel") {
    await cancelCurrentDraft(chatId, conversation);
    return;
  }

  if (text === BUTTONS.back) {
    if (!conversation.item_id) {
      await sendMainMenu(chatId, from);
      return;
    }
    if (conversation.step.startsWith("editing_")) {
      await returnToEditFields(chatId, from, conversation.item_id);
      return;
    }
    await createOrReplaceConversation({
      chatId: String(chatId),
      adminId: String(from.id),
      itemId: conversation.item_id,
      step: "awaiting_photos",
    });
    await sendMessage(
      chatId,
      [
        "Вернулись к загрузке фото.",
        `Можешь отправлять картинки или нажать <b>${BUTTONS.done}</b>.`,
      ].join("\n"),
      draftMarkup("awaiting_photos"),
    );
    return;
  }

  if (!item) {
    await sendMainMenu(chatId, from);
    return;
  }

  switch (conversation.step) {
    case "awaiting_photos":
      if (text === BUTTONS.done || text === "/done") {
        const imageCount = await sql`
          select count(*)::text as count from portfolio_item_images where item_id = ${item.id};
        `;
        if (Number((imageCount as { count: string }[])[0]?.count ?? "0") === 0) {
          await sendMessage(chatId, "Сначала отправь хотя бы одну фотографию.", draftMarkup("awaiting_photos"));
          return;
        }
        await createOrReplaceConversation({
          chatId: String(chatId),
          adminId: String(from.id),
          itemId: item.id,
          step: "awaiting_title",
        });
        await sendMessage(chatId, "Теперь пришли название товара.", draftMarkup("awaiting_title"));
        return;
      }
      await sendMessage(chatId, `Сначала отправь фото или нажми <b>${BUTTONS.done}</b>, когда закончишь.`, draftMarkup("awaiting_photos"));
      return;
    case "awaiting_title":
      await updateItem(item.id, { title: text });
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: item.id,
        step: "awaiting_description",
      });
      await sendMessage(chatId, "Теперь пришли описание.", draftMarkup("awaiting_description"));
      return;
    case "awaiting_description":
      await updateItem(item.id, { description: text });
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: item.id,
        step: "awaiting_size",
      });
      await sendMessage(chatId, "Теперь укажи размер.", draftMarkup("awaiting_size"));
      return;
    case "awaiting_size":
      await updateItem(item.id, { size: text });
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: item.id,
        step: "awaiting_price",
      });
      await sendMessage(chatId, "Теперь пришли цену в рублях, например 12500, 125.00 или 12 500 ₽.", draftMarkup("awaiting_price"));
      return;
    case "awaiting_price": {
      const cents = parsePriceToCents(text);
      if (cents === null) {
        await sendMessage(chatId, "Не смог распознать цену. Пришли сумму в рублях, например 12500 или 12 500 ₽.", draftMarkup("awaiting_price"));
        return;
      }
      await updateItem(item.id, { price_cents: cents });
      await publishItem(item.id);
      await clearConversation(String(chatId));
      await sendMessage(chatId, "Карточка опубликована.", mainMenuMarkup());
      return;
    }
    case "editing_select_field":
      await sendMessage(chatId, "Выбери поле для редактирования кнопкой ниже.", editFieldKeyboard(item.id));
      return;
    case "editing_title":
      await updateItem(item.id, { title: text });
      await returnToEditFields(chatId, from, item.id);
      return;
    case "editing_description":
      await updateItem(item.id, { description: text });
      await returnToEditFields(chatId, from, item.id);
      return;
    case "editing_size":
      await updateItem(item.id, { size: text });
      await returnToEditFields(chatId, from, item.id);
      return;
    case "editing_price": {
      const cents = parsePriceToCents(text);
      if (cents === null) {
        await sendMessage(chatId, "Не смог распознать цену. Пришли сумму в рублях, например 12500 или 12 500 ₽.", editFieldKeyboard(item.id));
        return;
      }
      await updateItem(item.id, { price_cents: cents });
      await returnToEditFields(chatId, from, item.id);
      return;
    }
    case "editing_photos":
      await sendMessage(chatId, `Отправляй фото или нажми <b>${BUTTONS.done}</b>, когда закончишь.`, editingPhotosMarkup());
      return;
  }
}

async function handlePhoto(message: TelegramMessage) {
  const chatId = message.chat.id;
  const from = message.from;
  const photo = message.photo?.at(-1);
  if (!from || !photo) return;
  const conversation = await getConversation(String(chatId));
  if (!conversation || !conversation.item_id) {
    await sendMainMenu(chatId, from);
    return;
  }

  if (conversation.step === "editing_photos") {
    const bytes = await getTelegramFile(photo.file_id);
    const stored = await storeImage(bytes, `${photo.file_id}.jpg`);
    await addImage({
      itemId: conversation.item_id,
      blobUrl: stored.url,
      source: stored.kind,
      telegramFileId: photo.file_id,
    });
    await sendMessage(chatId, "Фото добавлено к карточке.", editingPhotosMarkup());
    return;
  }

  if (conversation.step !== "awaiting_photos") {
    await sendMessage(chatId, "Сейчас фото не ожидаются.", draftMarkup(conversation.step));
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
  await sendMessage(chatId, "Фото принято. Можешь отправить ещё или нажать <b>Фото готовы</b>.", draftMarkup("awaiting_photos"));
}

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
  const message = callbackQuery.message;
  const chatId = message?.chat.id;
  const from = callbackQuery.from;
  if (chatId === undefined) {
    await answerCallbackQuery(callbackQuery.id, "Не удалось открыть меню");
    return;
  }

  const conversation = await getConversation(String(chatId));
  const data = callbackQuery.data ?? "";

  switch (data) {
    case CALLBACKS.home:
      await answerCallbackQuery(callbackQuery.id, "Главное меню");
      await sendMainMenu(chatId, from);
      return;
    case CALLBACKS.help:
      await answerCallbackQuery(callbackQuery.id, "Справка");
      await sendMessage(chatId, helpMessage(), mainMenuMarkup());
      return;
    case CALLBACKS.newItem:
      await answerCallbackQuery(callbackQuery.id, "Создаю черновик");
      await openNewDraft(chatId, from, conversation);
      return;
    case CALLBACKS.editItem:
      await answerCallbackQuery(callbackQuery.id, "Редактирование");
      await showEditItemList(chatId);
      return;
    case CALLBACKS.currentDraft:
      await answerCallbackQuery(callbackQuery.id, "Карточка");
      await showCurrentDraft(chatId, from, conversation);
      return;
    case CALLBACKS.cancel:
      await answerCallbackQuery(callbackQuery.id, "Отменено");
      await cancelCurrentDraft(chatId, conversation);
      return;
    case CALLBACKS.done:
      await answerCallbackQuery(callbackQuery.id, "Готово");
      if (conversation?.step === "editing_photos") {
        if (!conversation.item_id) {
          await sendMainMenu(chatId, from);
          return;
        }
        await returnToEditFields(chatId, from, conversation.item_id);
        return;
      }
      if (!conversation) {
        await sendMainMenu(chatId, from);
        return;
      }
      await handleText(
        {
          ...message!,
          from,
          text: BUTTONS.done,
        },
        BUTTONS.done,
      );
      return;
    case CALLBACKS.back:
      await answerCallbackQuery(callbackQuery.id, "Назад");
      if (!conversation?.item_id) {
        await sendMainMenu(chatId, from);
        return;
      }
      if (conversation.step.startsWith("editing_")) {
        await showEditItemList(chatId);
        return;
      }
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId: conversation.item_id,
        step: "awaiting_photos",
      });
      await sendMessage(chatId, "Вернулись к фото.", draftMarkup("awaiting_photos"));
      return;
  }

  if (data.startsWith("edit:item:")) {
    const itemId = data.slice("edit:item:".length);
    await answerCallbackQuery(callbackQuery.id, "Карточка выбрана");
    await startEditingItem(chatId, from, itemId, conversation);
    return;
  }

  if (data.startsWith("edit:field:")) {
    const parts = data.split(":");
    const itemId = parts[2];
    const field = parts[3];
    await answerCallbackQuery(callbackQuery.id, "Поле выбрано");
    if (!itemId || !field) {
      await sendMainMenu(chatId, from);
      return;
    }

    if (field === "title") {
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId,
        step: "editing_title",
      });
      await sendMessage(chatId, "Пришли новое название.", editFieldKeyboard(itemId));
      return;
    }

    if (field === "description") {
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId,
        step: "editing_description",
      });
      await sendMessage(chatId, "Пришли новое описание.", editFieldKeyboard(itemId));
      return;
    }

    if (field === "size") {
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId,
        step: "editing_size",
      });
      await sendMessage(chatId, "Пришли новый размер.", editFieldKeyboard(itemId));
      return;
    }

    if (field === "price") {
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId,
        step: "editing_price",
      });
      await sendMessage(chatId, "Пришли новую цену в рублях.", editFieldKeyboard(itemId));
      return;
    }

    if (field === "photos") {
      await createOrReplaceConversation({
        chatId: String(chatId),
        adminId: String(from.id),
        itemId,
        step: "editing_photos",
      });
      await sendMessage(chatId, "Отправляй дополнительные фото.", editingPhotosMarkup());
      return;
    }
  }

  await answerCallbackQuery(callbackQuery.id, "Готово");
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
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
