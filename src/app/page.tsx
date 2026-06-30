import { getImagesByItemIds, getPublishedItems } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency || "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

export default async function HomePage() {
  const items = await getPublishedItems();
  const images = await getImagesByItemIds(items.map((item) => item.id));
  const imageByItem = new Map<string, typeof images>();
  for (const image of images) {
    const existing = imageByItem.get(image.item_id) ?? [];
    existing.push(image);
    imageByItem.set(image.item_id, existing);
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Portfolio bot</p>
        <h1>Портфолио, которое наполняется из Telegram</h1>
        <p className="lede">
          Загружаешь фото в бот, отвечаешь на несколько вопросов, и карточка сразу появляется на сайте.
          Это удобно как для тебя, так и для клиента, который просто листает готовые работы.
        </p>
        <div className="meta-row">
          <span className="pill">Telegram admin flow</span>
          <span className="pill">Neon Postgres</span>
          <span className="pill">Vercel deploy</span>
        </div>
      </section>

      <section className="grid" aria-label="Portfolio items">
        {items.length === 0 ? (
          <div className="empty">
            Пока нет опубликованных работ. Отправь <code>/new</code> боту и создай первую карточку.
          </div>
        ) : (
          items.map((item) => {
            const itemImages = imageByItem.get(item.id) ?? [];
            const cover = itemImages[0];
            return (
              <article className="item" key={item.id}>
                <div className="item-media">
                  {cover ? (
                    <img src={cover.blob_url} alt={item.title || "Portfolio item"} />
                  ) : (
                    <div className="empty">No image</div>
                  )}
                </div>
                <div className="item-content">
                  <h2 className="item-title">{item.title}</h2>
                  <p className="item-description">{item.description}</p>
                  <div className="details">
                    <div className="detail">
                      <span className="detail-label">Размер</span>
                      <span className="detail-value">{item.size}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-label">Цена</span>
                      <span className="detail-value">{formatPrice(item.price_cents, "RUB")}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-label">Фото</span>
                      <span className="detail-value">{itemImages.length}</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
