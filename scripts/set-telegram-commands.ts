import { env } from "../src/lib/env";

type TelegramCommand = {
  command: string;
  description: string;
};

async function main() {
  const commands: TelegramCommand[] = [
    { command: "start", description: "Открыть меню" },
    { command: "new", description: "Создать новую карточку" },
    { command: "edit", description: "Редактировать карточку" },
    { command: "draft", description: "Показать текущий черновик" },
    { command: "help", description: "Показать подсказку" },
    { command: "cancel", description: "Отменить текущий черновик" },
    { command: "menu", description: "Показать меню" },
  ];

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ commands }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set commands: ${response.status} ${await response.text()}`);
  }

  console.log(await response.json());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
