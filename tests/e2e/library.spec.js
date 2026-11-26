import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { connectFixture, books } from "./fixtures";

async function noHorizontalOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test("landing page is responsive and leads to sign in", async ({
  page,
}, testInfo) => {
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({ json: { data: { configured: false, status: "ok" } } }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A little curiosity.",
  );
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `.tmp/qa/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Enter your library" }).click();
  await expect(
    page.getByRole("heading", { name: "Your library awaits." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to your library" }),
  ).toBeDisabled();
});

test("student dashboard presents real API fields without admin navigation", async ({
  page,
}, testInfo) => {
  await connectFixture(page);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  await expect(page.getByText("Books on loan", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Well-loved in your library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Students", exact: true }),
  ).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `.tmp/qa/student-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("catalog search, book details, confirmation and borrowing work", async ({
  page,
}) => {
  const fixture = await connectFixture(page);
  await page.goto("/app/catalog");
  await page
    .getByRole("searchbox", { name: "Search books" })
    .fill("Lighthouse");
  await expect(
    page.getByRole("heading", { name: "To the Lighthouse", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Waves", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search books" }).fill("Room");
  await page
    .getByRole("heading", { name: "A Room of One’s Own", exact: true })
    .getByRole("link")
    .click();
  await page.getByRole("button", { name: "Borrow this book" }).click();
  await expect(
    page.getByRole("dialog", { name: "Borrow this book?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm borrowing" }).click();
  await expect(
    page.getByText("Book borrowed. Find your due date in My borrowed books."),
  ).toBeVisible();
  expect(fixture.mutations[0].body.book_id).toBe(books[0].id);
  expect(fixture.mutations[0].headers["idempotency-key"]).toBeTruthy();
});

test("reservation cancellation requires confirmation", async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.goto("/app/reservations");
  await expect(page.getByText("#2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Cancel this reservation?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await expect(page.getByText("Reservation cancelled.")).toBeVisible();
  expect(fixture.mutations[0].path).toContain("/cancel");
});

test("a student cannot navigate to administrative pages", async ({ page }) => {
  await connectFixture(page);
  await page.goto("/app/students");
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
});

test("librarian dashboard and reports are responsive", async ({
  page,
}, testInfo) => {
  await connectFixture(page, "LIBRARIAN");
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `.tmp/qa/admin-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/app/reports");
  await expect(
    page.getByRole("heading", { name: "Reports & insights" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Books borrowed and returned over the last six months",
    }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /archthea-report.*\.csv/,
  );
});

test("librarian processes a return and inventory changes", async ({ page }) => {
  const fixture = await connectFixture(page, "LIBRARIAN");
  await page.goto("/app/circulation");
  await page.getByRole("button", { name: "Process return" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Process book return" });
  await dialog.getByLabel("Condition on return").selectOption("DAMAGED");
  await dialog.getByRole("button", { name: "Confirm return" }).click();
  await expect(
    page.getByText(
      "Return recorded. Any waiting reservation has been processed.",
    ),
  ).toBeVisible();
  expect(fixture.mutations[0].body.condition).toBe("DAMAGED");
  await page.goto(`/app/catalog/${books[0].id}`);
  await page.getByRole("button", { name: "Add copy", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Barcode", { exact: false })
    .fill("ARC-NEW-001");
  await page.getByRole("button", { name: "Save copy" }).click();
  await expect(page.getByText("Copy added to inventory.")).toBeVisible();
});

test("librarian registers a student and changes policies", async ({ page }) => {
  const fixture = await connectFixture(page, "LIBRARIAN");
  await page.goto("/app/students");
  await page.getByRole("button", { name: "Register student" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("New Reader");
  await dialog.getByLabel("Student number").fill("2026-100");
  await dialog
    .getByLabel("Email address", { exact: false })
    .fill("new-reader@example.edu");
  await dialog.getByRole("button", { name: "Register student" }).click();
  await expect(
    page.getByText("Student registered.", { exact: false }),
  ).toBeVisible();
  await page.goto("/app/settings");
  await page.getByLabel("Maximum borrowed books", { exact: false }).fill("5");
  await page.getByRole("button", { name: "Save library policies" }).click();
  await expect(
    page.getByText("Library policies updated.", { exact: false }),
  ).toBeVisible();
  expect(fixture.mutations.at(-1).body.max_books).toBe(5);
});

test("catalog gives recoverable feedback on an API failure", async ({
  page,
}) => {
  await connectFixture(page);
  let fail = true;
  await page.route("**/api/v1/books?**", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: {
            error: { message: "The library is temporarily unavailable." },
          },
        })
      : route.fulfill({
          json: { data: { items: [], total: 0, page: 1, page_size: 12 } },
        }),
  );
  await page.goto("/app/catalog");
  await expect(page.getByRole("alert")).toContainText(
    "The library is temporarily unavailable.",
  );
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your collection starts here" }),
  ).toBeVisible();
});

test("core screens have no serious accessibility violations", async ({
  page,
}) => {
  await connectFixture(page, "LIBRARIAN");
  await page.goto("/app/catalog");
  await expect(
    page.getByRole("heading", { name: "Explore the collection" }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations
      .filter((item) => ["critical", "serious"].includes(item.impact))
      .map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
  ).toEqual([]);
});

test("mobile navigation manages focus and closes after navigation", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "The drawer is used below the mobile navigation breakpoint.",
  );
  await connectFixture(page);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  const navigation = page.locator("aside.sidebar");
  await expect(navigation).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(navigation).not.toHaveAttribute("inert", "");
  await expect(
    navigation.getByRole("link", { name: "Archthea home" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    navigation.getByRole("button", { name: "Sign out" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await navigation.getByRole("link", { name: "Explore books" }).click();
  await expect(
    page.getByRole("heading", { name: "Explore the collection" }),
  ).toBeVisible();
  await expect(navigation).toHaveAttribute("inert", "");
});

test("public and sign-in screens are accessible", async ({ page }) => {
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({ json: { data: { configured: true, status: "ok" } } }),
  );
  for (const [path, title] of [
    ["/", "A little curiosity."],
    ["/login", "Your library awaits."],
    ["/forgot-password", "A fresh start."],
  ]) {
    await page.goto(path);
    await expect(
      page
        .getByRole("heading", {
          name: new RegExp(title.replaceAll(".", "\\.")),
        })
        .first(),
    ).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations
        .filter((item) => ["critical", "serious"].includes(item.impact))
        .map((item) => ({
          path,
          id: item.id,
          nodes: item.nodes.map((node) => node.target),
        })),
    ).toEqual([]);
  }
});
