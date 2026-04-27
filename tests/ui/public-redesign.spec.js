import { test, expect } from "@playwright/test";

const PUBLIC_ROUTES = [
  { path: "/", headings: [/choose the live campus experience you want to enter/i] },
  { path: "/modern-academy", headings: [/a brighter, stronger public presence/i] },
  { path: "/madrastul-attaufiq", headings: [/spiritual depth, disciplined study, and a calmer digital experience/i] },
  { path: "/about", headings: [/history of attaufeeq model academy/i] },
  { path: "/academics", headings: [/educational levels/i] },
  {
    path: "/admissions",
    headings: [/select the admissions pathway/i, /the admissions portal is currently unavailable/i]
  },
  { path: "/gallery", headings: [/school life in motion, memory, and atmosphere/i] },
  { path: "/contact", headings: [/our location/i] },
  { path: "/news", headings: [/news & events/i] },
  { path: "/result-checker", headings: [/check your result/i] },
];

test.describe("public redesign routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} renders key public content`, async ({ page }) => {
      test.setTimeout(60000);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      let matched = false;
      for (const heading of route.headings) {
        const locator = page.getByRole("heading", { name: heading }).first();
        try {
          await expect(locator).toBeVisible({ timeout: 20000 });
          matched = true;
          break;
        } catch {
          // try the next acceptable heading for this route
        }
      }
      expect(matched).toBeTruthy();
      await expect(page.locator("main")).toContainText(/\S/, { timeout: 10000 });
    });
  }
});
