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
      <section className="hero" aria-labelledby="order-info-title">
        <p className="eyebrow">Условия заказа</p>
        <h1 id="order-info-title">Иконы пишутся под заказ и в любом нужном размере</h1>
        <p className="lede">
          Все представленные в каталоге иконы можно написать в любом другом размере.
          Доставка в любую точку России за счёт покупателя.
          Тщательно упакую, чтобы до Вас всё доехало в целости и сохранности.
        </p>
        <div className="meta-row" aria-label="Короткие условия заказа">
          <span className="pill">СДЭК</span>
          <span className="pill">Boxberry</span>
          <span className="pill">Яндекс</span>
          <span className="pill">Почта России</span>
          <span className="pill">Предоплата 50%</span>
        </div>
        <ul className="order-list">
          <li>Отправлю СДЭК, Boxberry, Яндекс и Почтой России.</li>
          <li>Для заказа просто напишите мне.</li>
          <li>Заказы принимаю я сама, без помощников и менеджеров.</li>
          <li>Перед началом работ беру предоплату 50% на материалы и в знак подтверждения намерения.</li>
        </ul>
        <p className="order-note">
          Сразу после внесения предоплаты приступаю к работе.
        </p>
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
