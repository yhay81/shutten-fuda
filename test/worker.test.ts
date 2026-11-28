import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  app,
  eventNames,
  scheduled,
  validHttpsUrl,
  validOpportunityInput,
  type Bindings,
} from "../src/worker";

const pathOf = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const migrationPath = pathOf("../migrations/0001_opportunities.sql");
const origin = "https://shutten-fuda.yhay81.com";
const requestOrigin = "http://localhost";
const primarySession = "a2d0e2f2-66fd-4fd4-8e87-b0ef67ad194a";
const session = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const plusDays = (count: number) =>
  new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);
const opportunity = {
  applicationMethod: "form" as const,
  deadline: plusDays(30),
  environment: "outdoor" as const,
  eventEnd: plusDays(46),
  eventName: "星見の丘ハンドメイドマルシェ",
  eventStart: plusDays(45),
  eventType: "handmade" as const,
  feeMax: 5000,
  feeMin: 3000,
  feeType: "paid" as const,
  organizerName: "星見まちづくり実行委員会",
  prefecture: "東京都",
  region: "kanto" as const,
  selectionType: "screening" as const,
  sourceUrl: "https://example.com/vendors/handmade",
  summary: "作品と雑貨の屋外ブースを募集しています。",
  vendorTypes: ["handmade", "workshop"] as const,
};
let miniflare: Miniflare;
let bindings: Bindings;

const jsonRequest = (
  body: unknown,
  options: {
    capability?: string;
    method?: string;
    origin?: string;
    qa?: boolean;
    reporterIp?: string;
    session?: string;
    type?: string;
    length?: number;
  } = {},
): RequestInit => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-length": String(options.length ?? new TextEncoder().encode(raw).byteLength),
    "content-type": options.type ?? "application/json",
    origin: options.origin ?? requestOrigin,
    "x-shutten-fuda-qa": options.qa ? "1" : "0",
    "x-shutten-fuda-session": options.session ?? primarySession,
  };
  if (options.capability) headers["x-shutten-fuda-capability"] = options.capability;
  if (options.reporterIp) headers["cf-connecting-ip"] = options.reporterIp;
  return { body: raw, headers, method: options.method ?? "POST" };
};

const createOpportunity = async (
  options: { input?: Record<string, unknown>; qa?: boolean; session?: string } = {},
) => {
  const response = await app.request(
    "/api/opportunities",
    jsonRequest(options.input ?? opportunity, options),
    bindings,
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const payload = await response.json<{
    editUrl: string;
    opportunityId: string;
    publicUrl: string;
    slug: string;
  }>();
  return {
    capability: new URL(payload.editUrl).hash.slice(1),
    id: payload.opportunityId,
    payload,
    slug: payload.slug,
  };
};

beforeEach(async () => {
  miniflare = new Miniflare({
    workers: [
      {
        config: {
          name: "",
          compatibilityDate: "2026-07-29",
          env: { DB: { type: "d1", id: "shutten-fuda-test" } },
          manifest: {
            mainModule: "index.mjs",
            modules: {
              "index.mjs": {
                type: "esm",
                contents: "export default { fetch() { return new Response('test') } }",
              },
            },
          },
        },
      },
    ],
  });
  const database = await miniflare.getD1Database("DB");
  const migration = await readFile(migrationPath, "utf8");
  for (const statement of migration
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean))
    await database.prepare(statement).run();
  bindings = {
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    DB: database as unknown as D1Database,
    REPORT_HASH_KEY: "test-report-hmac-key-000000000000000000000000000000000000",
  };
});

afterEach(async () => miniflare.dispose());

describe("pages", () => {
  it.each([
    ["/", 'class="market-scene"', `${origin}/`],
    ["/guide", "札で比べ、正本で決める", `${origin}/guide`],
    ["/privacy", "応募情報を預からない", `${origin}/privacy`],
  ])("%s", async (path, marker, canonical) => {
    const response = await app.request(path, undefined, bindings);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(marker);
    expect(body).toContain(`href="${canonical}" rel="canonical"`);
    expect(response.headers.get("content-security-policy")).toContain("style-src 'self'");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(body).not.toMatch(/成功条件|市場スコア|公開実験|収益性/);
  });

  it("communicates the service through the market scene", async () => {
    const body = await (await app.request("/", undefined, bindings)).text();
    for (const marker of [
      'class="stall stall-a"',
      'class="application-gate"',
      'class="calendar-board"',
    ])
      expect(body).toContain(marker);
    expect(body).toContain("次の売り場を、締切から。");
  });

  it("renders an empty directory and protected editor shell", async () => {
    expect(await (await app.request("/list", undefined, bindings)).text()).toContain(
      "条件に合う募集札はありません",
    );
    const edit = await app.request("/edit/AbcdEfgh_123", undefined, bindings);
    expect(edit.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await app.request("/edit/short", undefined, bindings)).status).toBe(404);
  });

  it("reports health without exposing the secret", async () => {
    expect(await (await app.request("/health", undefined, bindings)).json()).toEqual({
      ok: true,
      reporting: true,
    });
  });
});

describe("validation", () => {
  it("accepts a complete opportunity", () => expect(validOpportunityInput(opportunity)).toBe(true));

  it.each([
    "http://example.com/vendors",
    "https://user:pass@example.com/vendors",
    "https://example.com:444/vendors",
    "https://localhost/vendors",
    "https://service.local/vendors",
    "https://127.0.0.1/vendors",
    "https://[::1]/vendors",
    "bad",
  ])("rejects source URL %s", (url) => {
    expect(validHttpsUrl(url)).toBe(false);
    expect(validOpportunityInput({ ...opportunity, sourceUrl: url })).toBe(false);
  });

  it.each([
    ["organizerName", ""],
    ["organizerName", "a".repeat(81)],
    ["eventName", "https://bad.example"],
    ["summary", "a".repeat(301)],
    ["prefecture", "東"],
    ["region", "overseas"],
    ["eventType", "concert"],
    ["environment", "online"],
    ["selectionType", "auction"],
    ["applicationMethod", "phone"],
    ["vendorTypes", []],
    ["vendorTypes", ["handmade", "handmade"]],
    ["vendorTypes", ["unknown"]],
    ["feeType", "donation"],
    ["feeMin", -1],
    ["feeMax", 500001],
    ["deadline", plusDays(0)],
    ["deadline", plusDays(181)],
    ["eventStart", plusDays(29)],
    ["eventEnd", plusDays(61)],
  ])("rejects %s", (key, value) =>
    expect(validOpportunityInput({ ...opportunity, [key]: value })).toBe(false),
  );

  it("requires the exact input shape", () => {
    expect(validOpportunityInput({ ...opportunity, extra: true })).toBe(false);
    const { summary: _summary, ...missing } = opportunity;
    expect(validOpportunityInput(missing)).toBe(false);
  });
});

describe("opportunity lifecycle", () => {
  it("creates a hashed capability and public detail", async () => {
    const created = await createOpportunity();
    expect(created.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(created.capability).toHaveLength(43);
    const row = await bindings.DB.prepare("SELECT capability_hash FROM opportunities WHERE id = ?")
      .bind(created.id)
      .first<{ capability_hash: string }>();
    expect(row?.capability_hash).toMatch(/^[0-9a-f]{64}$/);
    const detail = await app.request(`/opportunities/${created.slug}`, undefined, bindings);
    expect(detail.status).toBe(200);
    expect(await detail.text()).toContain('class="detail-stall"');
  });

  it("authorizes only the matching editor capability", async () => {
    const created = await createOpportunity();
    const good = await app.request(
      `/api/opportunities/${created.slug}`,
      { headers: { "x-shutten-fuda-capability": created.capability } },
      bindings,
    );
    expect(good.status).toBe(200);
    const bad = await app.request(
      `/api/opportunities/${created.slug}`,
      { headers: { "x-shutten-fuda-capability": "A".repeat(43) } },
      bindings,
    );
    expect(bad.status).toBe(404);
  });

  it("searches and preserves filters", async () => {
    const created = await createOpportunity();
    const body = await (
      await app.request(
        "/list?q=%E6%98%9F%E8%A6%8B&region=kanto&type=handmade&vendor=workshop&environment=outdoor&fee=paid&selection=screening",
        undefined,
        bindings,
      )
    ).text();
    expect(body).toContain(created.slug);
    for (const value of ["kanto", "handmade", "workshop", "outdoor", "paid", "screening"])
      expect(body).toContain(`selected="" value="${value}"`);
    expect(
      await (await app.request("/list?region=kyushu", undefined, bindings)).text(),
    ).not.toContain(created.slug);
  });

  it("returns the existing slug for a duplicate source", async () => {
    const created = await createOpportunity();
    const response = await app.request(
      "/api/opportunities",
      jsonRequest(opportunity, { session: session(2) }),
      bindings,
    );
    expect(response.status).toBe(409);
    expect((await response.json<{ slug: string }>()).slug).toBe(created.slug);
  });

  it("updates, closes, reopens, and deletes", async () => {
    const created = await createOpportunity();
    const options = (body: unknown, method = "POST") =>
      jsonRequest(body, { capability: created.capability, method });
    expect(
      (await app.request(`/api/opportunities/${created.slug}/close`, options({}), bindings)).status,
    ).toBe(200);
    expect((await app.request(`/opportunities/${created.slug}`, undefined, bindings)).status).toBe(
      404,
    );
    expect(
      (
        await app.request(
          `/api/opportunities/${created.slug}`,
          options({ ...opportunity, eventName: "星見の丘クラフト市" }, "PUT"),
          bindings,
        )
      ).status,
    ).toBe(200);
    expect(
      await (await app.request(`/opportunities/${created.slug}`, undefined, bindings)).text(),
    ).toContain("星見の丘クラフト市");
    expect(
      (
        await app.request(
          `/api/opportunities/${created.slug}`,
          {
            headers: {
              origin: requestOrigin,
              "x-shutten-fuda-capability": created.capability,
              "x-shutten-fuda-session": primarySession,
            },
            method: "DELETE",
          },
          bindings,
        )
      ).status,
    ).toBe(204);
  });

  it("rejects a cross-origin delete", async () => {
    const created = await createOpportunity();
    const response = await app.request(
      `/api/opportunities/${created.slug}`,
      {
        headers: {
          origin: "https://evil.example",
          "x-shutten-fuda-capability": created.capability,
          "x-shutten-fuda-session": primarySession,
        },
        method: "DELETE",
      },
      bindings,
    );
    expect(response.status).toBe(400);
  });

  it("limits each session to three creates per day", async () => {
    for (let index = 0; index < 3; index++)
      await createOpportunity({
        input: { ...opportunity, sourceUrl: `https://example.com/vendors/${index}` },
      });
    expect(
      (
        await app.request(
          "/api/opportunities",
          jsonRequest({
            ...opportunity,
            sourceUrl: "https://example.com/vendors/fourth",
          }),
          bindings,
        )
      ).status,
    ).toBe(429);
  });

  it.each([
    [{ origin: "https://evil.example" }, 400],
    [{ type: "text/plain" }, 400],
    [{ length: 13000 }, 400],
    [{ session: "bad" }, 400],
  ])("enforces the request boundary", async (options, status) => {
    expect(
      (await app.request("/api/opportunities", jsonRequest(opportunity, options), bindings)).status,
    ).toBe(status);
  });

  it("adds public opportunities to the sitemap", async () => {
    const created = await createOpportunity();
    const body = await (await app.request("/sitemap.xml", undefined, bindings)).text();
    expect(body.match(/<url>/g)).toHaveLength(5);
    expect(body).toContain(`${origin}/opportunities/${created.slug}`);
  });
});

describe("reports, events, and retention", () => {
  it("deduplicates one network before hiding on three independent reports", async () => {
    const created = await createOpportunity();
    for (const [index, ip] of [
      [1, "203.0.113.1"],
      [2, "203.0.113.1"],
      [3, "203.0.113.3"],
    ] as const) {
      const response = await app.request(
        `/api/opportunities/${created.slug}/report`,
        jsonRequest({ reason: "closed" }, { reporterIp: ip, session: session(index) }),
        bindings,
      );
      expect(response.status).toBe(202);
    }
    expect((await app.request(`/opportunities/${created.slug}`, undefined, bindings)).status).toBe(
      200,
    );
    const final = await app.request(
      `/api/opportunities/${created.slug}/report`,
      jsonRequest({ reason: "closed" }, { reporterIp: "203.0.113.4", session: session(4) }),
      bindings,
    );
    expect(await final.json()).toMatchObject({ hidden: true });
    expect((await app.request(`/opportunities/${created.slug}`, undefined, bindings)).status).toBe(
      404,
    );
    expect(
      (
        await app.request(
          `/api/opportunities/${created.slug}`,
          jsonRequest(opportunity, {
            capability: created.capability,
            method: "PUT",
          }),
          bindings,
        )
      ).status,
    ).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM opportunity_reports").first(),
    ).toEqual({ count: 0 });
  });

  it("does not count QA reports toward hiding", async () => {
    const created = await createOpportunity();
    for (let index = 1; index <= 3; index++)
      await app.request(
        `/api/opportunities/${created.slug}/report`,
        jsonRequest(
          { reason: "closed" },
          { qa: true, reporterIp: `198.51.100.${index}`, session: session(index) },
        ),
        bindings,
      );
    expect((await app.request(`/opportunities/${created.slug}`, undefined, bindings)).status).toBe(
      200,
    );
  });

  it.each(["visited", "directory_searched", "opportunity_opened", "source_opened", "returned"])(
    "accepts browser event %s",
    async (name) => {
      expect(
        (
          await app.request(
            "/api/events",
            jsonRequest({ name, opportunityId: "" }, { qa: true }),
            bindings,
          )
        ).status,
      ).toBe(202);
    },
  );

  it("rejects server-event spoofing", async () => {
    expect(
      (
        await app.request(
          "/api/events",
          jsonRequest({ name: "opportunity_created", opportunityId: "" }),
          bindings,
        )
      ).status,
    ).toBe(400);
  });

  it("retains only bounded operational state", async () => {
    const created = await createOpportunity();
    const old = Math.floor(Date.now() / 1000) - 50 * 86400;
    await bindings.DB.prepare(
      "UPDATE opportunities SET status = 'closed', updated_at = ? WHERE id = ?",
    )
      .bind(old, created.id)
      .run();
    await bindings.DB.prepare("UPDATE product_events SET created_at = ?").bind(old).run();
    await scheduled({} as ScheduledController, bindings, {} as ExecutionContext);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM opportunities").first(),
    ).toEqual({ count: 0 });
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS count FROM product_events").first(),
    ).toEqual({ count: 0 });
  });

  it("keeps release assets and metrics aligned", async () => {
    const [worker, scripts, styles, sw, manifest, og, metrics] = await Promise.all([
      readFile(pathOf("../src/worker.tsx"), "utf8"),
      Promise.all(
        ["app.js", "common.js", "directory.js", "edit.js", "opportunity.js", "sw.js"].map((name) =>
          readFile(pathOf(`../public/${name}`), "utf8"),
        ),
      ).then((files) => files.join("\n")),
      readFile(pathOf("../public/styles.css"), "utf8"),
      readFile(pathOf("../public/sw.js"), "utf8"),
      readFile(pathOf("../public/manifest.webmanifest"), "utf8"),
      readFile(pathOf("../public/og.png")),
      readFile(pathOf("../ops/product-metrics.sql"), "utf8"),
    ]);
    expect(`${worker}\n${scripts}`).not.toMatch(/\son[a-z]+\s*=/i);
    expect(styles).toContain("clamp(1.75rem, 3.2vw, 2rem)");
    expect(styles).toContain("@media print");
    const shell = sw.slice(sw.indexOf("const shell"), sw.indexOf("];", sw.indexOf("const shell")));
    expect(shell).not.toContain('"/list"');
    expect(shell).not.toContain('"/opportunities/"');
    expect(JSON.parse(manifest).name).toBe("出店札");
    expect(og.byteLength).toBeGreaterThan(50000);
    expect(metrics).toContain("WHERE is_qa = 0");
    expect([...eventNames]).toHaveLength(10);
  });
});
