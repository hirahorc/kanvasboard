import type { Locator, Page } from "playwright-core";
import type { Target } from "./config.js";

/** a target as Playwright finds it: visible matches only, the first unless `nth` says */
export function locate(page: Page, t: Target): Locator {
  if (typeof t === "string") {
    const exact = { name: t, exact: true };
    return page
      .getByRole("button", exact)
      .or(page.getByRole("link", exact))
      .or(page.getByText(t, { exact: true }))
      .filter({ visible: true })
      .first();
  }
  const root = t.within ? page.locator(t.within) : page;
  const exact = !t.contains;
  let found: Locator;
  if (t.role) found = root.getByRole(t.role as Parameters<Page["getByRole"]>[0], t.name ? { name: t.name, exact } : {});
  // a <select> wrapped in its <label> carries its options' words too: its accessible name is the label's own
  else if (t.label) found = root.getByLabel(t.label, { exact }).or(root.getByRole("combobox", { name: t.label, exact })).or(root.getByRole("listbox", { name: t.label, exact }));
  else if (t.placeholder) found = root.getByPlaceholder(t.placeholder, { exact });
  else if (t.text) found = root.getByText(t.text, { exact });
  else if (t.css) found = root.locator(t.css);
  else throw new Error(`a target needs role, label, placeholder, text or css: ${JSON.stringify(t)}`);
  found = found.filter({ visible: true });
  return t.nth !== undefined ? found.nth(t.nth) : found.first();
}

/** a target in words, for a message */
export const say = (t: Target): string =>
  typeof t === "string"
    ? `"${t}"`
    : [t.role && `${t.role}${t.name ? ` "${t.name}"` : ""}`, t.label && `field "${t.label}"`, t.placeholder && `placeholder "${t.placeholder}"`, t.text && `"${t.text}"`, t.css, t.nth !== undefined && `#${t.nth}`, t.within && `in ${t.within}`]
        .filter(Boolean)
        .join(" ");
