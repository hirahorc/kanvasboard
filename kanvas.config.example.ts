// What an app puts in its own repo as kanvas.config.ts. An example shop, not a real app.
import { defineConfig } from "kanvas";

const cart = (items: { sku: string; qty: number }[]) => ({
  localStorage: { "shop:cart": JSON.stringify({ items }) },
});

export default defineConfig({
  baseUrl: "http://localhost:3000",
  clock: "2026-11-24T09:00:00+07:00",
  devices: [
    { id: "desktop", label: "Desktop", width: 1280, height: 900 },
    { id: "mobile", label: "Mobile", width: 390, height: 844, mobile: true },
  ],
  boards: [
    {
      id: "checkout",
      title: "Checkout",
      lanes: [
        {
          id: "cart",
          title: "The cart",
          story: "As a shopper, I want to see what I'm buying before I pay.",
          rules: ["Prices include VAT.", "A cart is kept for 30 days."],
          rows: [
            {
              kind: "positive",
              scenes: [
                { id: "cart-two", title: "Two items", path: "/cart", seed: cart([{ sku: "mug", qty: 1 }, { sku: "tee", qty: 2 }]) },
                {
                  id: "cart-remove",
                  title: "Removing an item",
                  path: "/cart",
                  from: "cart-two",
                  via: "Remove",
                  seed: cart([{ sku: "mug", qty: 1 }, { sku: "tee", qty: 2 }]),
                  steps: [{ click: { role: "button", name: "Remove Mug" } }],
                  view: "screen",
                  rules: ["Removing asks first: it can't be undone."],
                },
              ],
            },
            { kind: "edge", scenes: [{ id: "cart-empty", title: "Empty", path: "/cart" }] },
            { kind: "negative", scenes: [{ id: "cart-sold-out", title: "An item sold out", gap: true }] },
          ],
        },
      ],
    },
  ],
});
