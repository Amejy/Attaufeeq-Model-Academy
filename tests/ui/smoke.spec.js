import { test, expect } from "@playwright/test";

async function ensureBackendReady(request) {
  const override = process.env.PLAYWRIGHT_BACKEND_URL;
  const candidates = override
    ? [override]
    : ["http://127.0.0.1:4000/api/health", "http://127.0.0.1:4001/api/health"];

  for (const url of candidates) {
    try {
      const response = await request.get(url);
      if (response.ok()) return url;
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function ensureFrontendApiReady(request) {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
  try {
    const response = await request.get(`${baseUrl}/api/health`);
    return response.ok();
  } catch {
    return false;
  }
}

async function verifyCredentials(request, backendHealthUrl, email, password) {
  if (!backendHealthUrl) return false;
  const base = backendHealthUrl.replace(/\/api\/health$/, "");
  try {
    const response = await request.post(`${base}/api/auth/login`, {
      data: { email, password }
    });
    return response.ok();
  } catch {
    return false;
  }
}

async function signInAndWait(page, email, password, expectedUrl) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(expectedUrl, { timeout: 15000 });
}

test("public homepage loads", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/ATTAUFEEQ/i);
  await expect(
    page.getByRole("banner").getByRole("link", { name: /parent\/student/i })
  ).toBeVisible({ timeout: 15000 });
});

test("student login page loads", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/login/student", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /student access/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("admin login page loads", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/staff-access/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /admin access/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("teacher login page loads", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/staff-access/teacher", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /teacher access/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("admissions login page loads", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/staff-access/admissions", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /admissions access/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("parent login page loads", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/login/parent", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /parent access/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test.describe("admin auth flow", () => {
  test("admin can sign in and see dashboard actions", async ({ page, request }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

    test.skip(!adminEmail || !adminPassword, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run admin auth flow.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, adminEmail, adminPassword);
    test.skip(!credsOk, "Admin credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/admin");
    await signInAndWait(page, adminEmail, adminPassword, /\/portal\/admin/);
    await expect(page.getByRole("heading", { name: /admin quick actions/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /manage students/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /manage teachers/i })).toBeVisible();

    await page.getByRole("link", { name: /manage students/i }).click();
    await expect(page).toHaveURL(/\/portal\/admin\/students/);
  });

  test("admin can open teachers, classes, subjects, and tokens", async ({ page, request }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

    test.skip(!adminEmail || !adminPassword, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run admin flows.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, adminEmail, adminPassword);
    test.skip(!credsOk, "Admin credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/admin");
    await signInAndWait(page, adminEmail, adminPassword, /\/portal\/admin/);

    const targets = [
      { name: /teachers/i, url: /\/portal\/admin\/teachers/ },
      { name: /classes/i, url: /\/portal\/admin\/classes/ },
      { name: /subjects/i, url: /\/portal\/admin\/subjects/ },
      { name: /result tokens/i, url: /\/portal\/admin\/result-tokens/ }
    ];

    for (const target of targets) {
      const link = page.getByRole("link", { name: target.name });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(target.url);
    }
  });

  test("admin results publish page opens", async ({ page, request }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

    test.skip(!adminEmail || !adminPassword, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run admin flows.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, adminEmail, adminPassword);
    test.skip(!credsOk, "Admin credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/admin");
    await signInAndWait(page, adminEmail, adminPassword, /\/portal\/admin/);
    await page.goto("/portal/admin/results");
    await expect(page).toHaveURL(/\/portal\/admin\/results/);
    await expect(page.getByRole("heading", { name: /result approval and publishing/i })).toBeVisible();
    await page.getByRole("button", { name: /publish approved results/i }).click({ trial: true });
  });
});

test.describe("role auth flows", () => {
  test("teacher can sign in and reach dashboard", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_TEACHER_EMAIL;
    const password = process.env.PLAYWRIGHT_TEACHER_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_TEACHER_EMAIL and PLAYWRIGHT_TEACHER_PASSWORD to run teacher auth flow.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Teacher credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/teacher");
    await signInAndWait(page, email, password, /\/portal\/teacher/);
  });

  test("admissions can sign in and reach dashboard", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_ADMISSIONS_EMAIL;
    const password = process.env.PLAYWRIGHT_ADMISSIONS_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_ADMISSIONS_EMAIL and PLAYWRIGHT_ADMISSIONS_PASSWORD to run admissions auth flow.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Admissions credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/admissions");
    await signInAndWait(page, email, password, /\/portal\/admissions/);
  });

  test("student can sign in and reach dashboard", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_STUDENT_EMAIL;
    const password = process.env.PLAYWRIGHT_STUDENT_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_STUDENT_EMAIL and PLAYWRIGHT_STUDENT_PASSWORD to run student auth flow.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Student credentials are invalid for UI auth flow.");

    await page.goto("/login/student");
    await signInAndWait(page, email, password, /\/portal\/student/);
  });

  test("parent can sign in and reach dashboard", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_PARENT_EMAIL;
    const password = process.env.PLAYWRIGHT_PARENT_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_PARENT_EMAIL and PLAYWRIGHT_PARENT_PASSWORD to run parent auth flow.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Parent credentials are invalid for UI auth flow.");

    await page.goto("/login/parent");
    await signInAndWait(page, email, password, /\/portal\/parent/);
  });
});

test.describe("results pages", () => {
  test("student results page loads", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_STUDENT_EMAIL;
    const password = process.env.PLAYWRIGHT_STUDENT_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_STUDENT_EMAIL and PLAYWRIGHT_STUDENT_PASSWORD to run student results test.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Student credentials are invalid for UI auth flow.");

    await page.goto("/login/student");
    await signInAndWait(page, email, password, /\/portal\/student/);

    await page.goto("/portal/student/results");
    await expect(page).toHaveURL(/\/portal\/student\/results/);
    await expect(page.getByRole("heading", { name: /results/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /generate report card/i })).toBeVisible();
  });

  test("teacher results page loads", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_TEACHER_EMAIL;
    const password = process.env.PLAYWRIGHT_TEACHER_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_TEACHER_EMAIL and PLAYWRIGHT_TEACHER_PASSWORD to run teacher results test.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Teacher credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/teacher");
    await signInAndWait(page, email, password, /\/portal\/teacher/);

    await page.goto("/portal/teacher/results");
    await expect(page).toHaveURL(/\/portal\/teacher\/results/);
    await expect(page.getByRole("heading", { name: /results/i })).toBeVisible();
  });

  test("parent results page opens after token", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_PARENT_EMAIL;
    const password = process.env.PLAYWRIGHT_PARENT_PASSWORD;
    const token = process.env.PLAYWRIGHT_PARENT_TOKEN;

    test.skip(!email || !password, "Set PLAYWRIGHT_PARENT_EMAIL and PLAYWRIGHT_PARENT_PASSWORD to run parent results test.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Parent credentials are invalid for UI auth flow.");

    await page.goto("/login/parent");
    await signInAndWait(page, email, password, /\/portal\/parent/);

    await page.goto("/portal/parent/results");
    await expect(page).toHaveURL(/\/portal\/parent\/results/);
    await expect(page.getByRole("heading", { name: /child results/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /generate report card/i })).toBeVisible();

    if (token) {
      const tokenInput = page.getByPlaceholder("Enter token");
      if (await tokenInput.isVisible()) {
        await tokenInput.fill(token);
        await page.getByRole("button", { name: /activate/i }).click();
        await expect(page.getByText(/token/i)).toBeVisible();
      }
    }
  });
});

test.describe("attendance pages", () => {
  test("teacher attendance page loads", async ({ page, request }) => {
    const email = process.env.PLAYWRIGHT_TEACHER_EMAIL;
    const password = process.env.PLAYWRIGHT_TEACHER_PASSWORD;

    test.skip(!email || !password, "Set PLAYWRIGHT_TEACHER_EMAIL and PLAYWRIGHT_TEACHER_PASSWORD to run teacher attendance test.");
    const frontendReady = await ensureFrontendApiReady(request);
    test.skip(!frontendReady, "Frontend proxy cannot reach backend API. Check VITE_BACKEND_PROXY_TARGET and backend port.");
    const backendReady = await ensureBackendReady(request);
    test.skip(!backendReady, "Backend API is not reachable. Start the backend before running auth tests.");
    const credsOk = await verifyCredentials(request, backendReady, email, password);
    test.skip(!credsOk, "Teacher credentials are invalid for UI auth flow.");

    await page.goto("/staff-access/teacher");
    await signInAndWait(page, email, password, /\/portal\/teacher/);

    await page.goto("/portal/teacher/attendance");
    await expect(page).toHaveURL(/\/portal\/teacher\/attendance/);
    await expect(page.getByRole("heading", { name: /attendance register/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /save attendance/i })).toBeVisible();
  });
});
