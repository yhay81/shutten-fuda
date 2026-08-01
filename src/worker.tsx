/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { html } from "hono/html";
import type { Child } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";
import { secureHeaders } from "hono/secure-headers";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  REPORT_HASH_KEY?: string;
};

type Variables = { requestId: string };
type Region =
  | "chubu"
  | "chugoku"
  | "hokkaido"
  | "kansai"
  | "kanto"
  | "kyushu"
  | "shikoku"
  | "tohoku";
type EventType = "festival" | "flea" | "handmade" | "marche" | "other";
type VendorType =
  | "flea"
  | "food"
  | "handmade"
  | "kitchen_car"
  | "other"
  | "performance"
  | "workshop";
type Environment = "both" | "indoor" | "outdoor";
type FeeType = "free" | "paid" | "unknown";
type SelectionType = "first" | "lottery" | "screening" | "unknown";
type ApplicationMethod = "email" | "form" | "other";

type OpportunityInput = {
  applicationMethod: ApplicationMethod;
  deadline: string;
  environment: Environment;
  eventEnd: string;
  eventName: string;
  eventStart: string;
  eventType: EventType;
  feeMax: number;
  feeMin: number;
  feeType: FeeType;
  organizerName: string;
  prefecture: string;
  region: Region;
  selectionType: SelectionType;
  sourceUrl: string;
  summary: string;
  vendorTypes: VendorType[];
};

type OpportunityRow = {
  application_method: ApplicationMethod;
  created_at: number;
  deadline: string;
  environment: Environment;
  event_end: string;
  event_name: string;
  event_start: string;
  event_type: EventType;
  fee_max: number;
  fee_min: number;
  fee_type: FeeType;
  id: string;
  organizer_name: string;
  prefecture: string;
  region: Region;
  report_count: number;
  selection_type: SelectionType;
  slug: string;
  source_url: string;
  status: "active" | "closed" | "hidden";
  summary: string;
  updated_at: number;
  vendor_types: string;
};

type Filters = {
  environment: string;
  eventType: string;
  feeType: string;
  query: string;
  region: string;
  selectionType: string;
  soon: boolean;
  vendorType: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const canonicalOrigin = "https://shutten-fuda.yhay81.com";
const eventLifetime = 45 * 86400;
const inactiveLifetime = 30 * 86400;
export const eventNames = new Set([
  "visited",
  "directory_searched",
  "opportunity_created",
  "opportunity_opened",
  "source_opened",
  "opportunity_updated",
  "opportunity_closed",
  "opportunity_deleted",
  "opportunity_reported",
  "returned",
]);
const browserEventNames = new Set([
  "visited",
  "directory_searched",
  "opportunity_opened",
  "source_opened",
  "returned",
]);
const regionLabels: Record<Region, string> = {
  chubu: "中部",
  chugoku: "中国",
  hokkaido: "北海道",
  kansai: "関西",
  kanto: "関東",
  kyushu: "九州・沖縄",
  shikoku: "四国",
  tohoku: "東北",
};
const eventLabels: Record<EventType, string> = {
  festival: "地域イベント",
  flea: "フリーマーケット",
  handmade: "ハンドメイド",
  marche: "マルシェ",
  other: "その他",
};
const vendorLabels: Record<VendorType, string> = {
  flea: "古物・不用品",
  food: "飲食・菓子",
  handmade: "作品・雑貨",
  kitchen_car: "キッチンカー",
  other: "その他",
  performance: "実演・出演",
  workshop: "ワークショップ",
};
const environmentLabels: Record<Environment, string> = {
  both: "屋内外",
  indoor: "屋内",
  outdoor: "屋外",
};
const feeLabels: Record<FeeType, string> = { free: "無料", paid: "有料", unknown: "要項で確認" };
const selectionLabels: Record<SelectionType, string> = {
  first: "先着",
  lottery: "抽選",
  screening: "審査",
  unknown: "要項で確認",
};
const applicationLabels: Record<ApplicationMethod, string> = {
  email: "メール",
  form: "フォーム",
  other: "要項で確認",
};
const regions = new Set(Object.keys(regionLabels));
const eventTypes = new Set(Object.keys(eventLabels));
const vendorValues = new Set(Object.keys(vendorLabels));
const environments = new Set(Object.keys(environmentLabels));
const feeTypes = new Set(Object.keys(feeLabels));
const selectionTypes = new Set(Object.keys(selectionLabels));
const methods = new Set(Object.keys(applicationLabels));
const reportReasons = new Set(["closed", "harmful", "impersonation", "other"]);
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[A-Za-z0-9_-]{12}$/;
const capabilityPattern = /^[A-Za-z0-9_-]{43}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const exactOpportunityKeys = [
  "applicationMethod",
  "deadline",
  "environment",
  "eventEnd",
  "eventName",
  "eventStart",
  "eventType",
  "feeMax",
  "feeMin",
  "feeType",
  "organizerName",
  "prefecture",
  "region",
  "selectionType",
  "sourceUrl",
  "summary",
  "vendorTypes",
];

const nowSeconds = () => Math.floor(Date.now() / 1000);
const day = () => new Date().toISOString().slice(0, 10);
const containsControl = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
const plainLine = (value: unknown, minimum: number, maximum: number) =>
  typeof value === "string" &&
  value === value.trim() &&
  value.length >= minimum &&
  value.length <= maximum &&
  !containsControl(value) &&
  !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b0\d{1,4}-?\d{2,4}-?\d{3,4}\b)/iu.test(value);
const plainSummary = (value: unknown) =>
  typeof value === "string" &&
  value === value.trim() &&
  value.length <= 300 &&
  !containsControl(value.replaceAll("\n", "")) &&
  !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b0\d{1,4}-?\d{2,4}-?\d{3,4}\b)/iu.test(value);
const isExactObject = (value: unknown, keys: string[]) =>
  Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|"),
  );
export const validHttpsUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      hostname.length <= 253 &&
      hostname !== "localhost" &&
      hostname !== "0.0.0.0" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
      !hostname.includes(":")
    );
  } catch {
    return false;
  }
};
const normalizeUrl = (value: string) => {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
};
const dateNumber = (value: string) => {
  if (!datePattern.test(value)) return Number.NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : Number.NaN;
};
const validDates = (deadline: unknown, start: unknown, end: unknown) => {
  if (typeof deadline !== "string" || typeof start !== "string" || typeof end !== "string")
    return false;
  const deadlineAt = dateNumber(deadline);
  const startAt = dateNumber(start);
  const endAt = dateNumber(end);
  const today = dateNumber(day());
  return (
    Number.isFinite(deadlineAt) &&
    Number.isFinite(startAt) &&
    Number.isFinite(endAt) &&
    deadlineAt >= today + 86400000 &&
    deadlineAt <= today + 180 * 86400000 &&
    startAt >= deadlineAt &&
    startAt <= today + 365 * 86400000 &&
    endAt >= startAt &&
    endAt <= startAt + 14 * 86400000
  );
};
const validFee = (type: unknown, minimum: unknown, maximum: unknown) => {
  if (!feeTypes.has(String(type)) || !Number.isInteger(minimum) || !Number.isInteger(maximum))
    return false;
  const min = minimum as number;
  const max = maximum as number;
  if (type === "paid") return min >= 0 && max >= min && max <= 500000;
  return min === 0 && max === 0;
};
export const validOpportunityInput = (value: unknown): value is OpportunityInput => {
  if (!isExactObject(value, exactOpportunityKeys)) return false;
  const input = value as Partial<OpportunityInput>;
  return Boolean(
    plainLine(input.organizerName, 1, 80) &&
    plainLine(input.eventName, 1, 100) &&
    plainSummary(input.summary) &&
    plainLine(input.prefecture, 2, 8) &&
    regions.has(String(input.region)) &&
    eventTypes.has(String(input.eventType)) &&
    environments.has(String(input.environment)) &&
    selectionTypes.has(String(input.selectionType)) &&
    methods.has(String(input.applicationMethod)) &&
    Array.isArray(input.vendorTypes) &&
    input.vendorTypes.length >= 1 &&
    input.vendorTypes.length <= 5 &&
    new Set(input.vendorTypes).size === input.vendorTypes.length &&
    input.vendorTypes.every((vendorType) => vendorValues.has(String(vendorType))) &&
    validFee(input.feeType, input.feeMin, input.feeMax) &&
    validDates(input.deadline, input.eventStart, input.eventEnd) &&
    validHttpsUrl(input.sourceUrl),
  );
};
const parseJson = async (request: Request, maximum: number): Promise<unknown> => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximum) throw new Error("body_too_large");
  return JSON.parse(raw);
};
const validBoundary = (request: Request, maximum: number) => {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const contentType = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? "0");
  return (
    (!origin || origin === requestOrigin) &&
    contentType.toLowerCase().startsWith("application/json") &&
    Number.isFinite(length) &&
    length <= maximum
  );
};
const randomBase64Url = (bytes: number) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of data) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const reportFingerprint = async (
  request: Request,
  secret: string | undefined,
  opportunityId: string,
  sessionId: string,
) => {
  if (!secret || secret.length < 32) return "";
  const hostname = new URL(request.url).hostname;
  const network =
    request.headers.get("cf-connecting-ip")?.trim() ||
    (hostname === "localhost" || hostname === "127.0.0.1" ? `local:${sessionId}` : "");
  if (!network || network.length > 64) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${opportunityId}\u0000${network}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const sessionFrom = (request: Request) => {
  const value = request.headers.get("x-shutten-fuda-session") ?? "";
  return sessionPattern.test(value) ? value : "";
};
const qaFrom = (request: Request) => (request.headers.get("x-shutten-fuda-qa") === "1" ? 1 : 0);
const feeText = (input: OpportunityInput) => {
  if (input.feeType !== "paid") return feeLabels[input.feeType];
  if (input.feeMin === input.feeMax) return `${input.feeMin.toLocaleString("ja-JP")}円`;
  return `${input.feeMin.toLocaleString("ja-JP")}〜${input.feeMax.toLocaleString("ja-JP")}円`;
};
const opportunityToInput = (row: OpportunityRow): OpportunityInput => ({
  applicationMethod: row.application_method,
  deadline: row.deadline,
  environment: row.environment,
  eventEnd: row.event_end,
  eventName: row.event_name,
  eventStart: row.event_start,
  eventType: row.event_type,
  feeMax: row.fee_max,
  feeMin: row.fee_min,
  feeType: row.fee_type,
  organizerName: row.organizer_name,
  prefecture: row.prefecture,
  region: row.region,
  selectionType: row.selection_type,
  sourceUrl: row.source_url,
  summary: row.summary,
  vendorTypes: JSON.parse(row.vendor_types) as VendorType[],
});
const findOpportunity = async (database: D1Database, slug: string, publicOnly = false) =>
  database
    .prepare(
      `SELECT * FROM opportunities WHERE slug = ? ${publicOnly ? "AND status = 'active' AND deadline >= ?" : ""} LIMIT 1`,
    )
    .bind(...(publicOnly ? [slug, day()] : [slug]))
    .first<OpportunityRow>();
const authorizedOpportunity = async (request: Request, database: D1Database, slug: string) => {
  const capability = request.headers.get("x-shutten-fuda-capability") ?? "";
  if (!capabilityPattern.test(capability)) return null;
  const row = await database
    .prepare("SELECT * FROM opportunities WHERE slug = ? AND capability_hash = ? LIMIT 1")
    .bind(slug, await sha256(capability))
    .first<OpportunityRow>();
  return row ?? null;
};
const insertEvent = (
  database: D1Database,
  name: string,
  sessionId: string,
  opportunityId: string,
  isQa: number,
) =>
  database
    .prepare(
      `INSERT INTO product_events (name, session_id, opportunity_id, day, created_at, is_qa) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(name, sessionId, opportunityId || null, day(), nowSeconds(), isQa)
    .run();
const filtersFrom = (url: URL): Filters => ({
  environment: environments.has(url.searchParams.get("environment") ?? "")
    ? (url.searchParams.get("environment") ?? "")
    : "",
  eventType: eventTypes.has(url.searchParams.get("type") ?? "")
    ? (url.searchParams.get("type") ?? "")
    : "",
  feeType: feeTypes.has(url.searchParams.get("fee") ?? "")
    ? (url.searchParams.get("fee") ?? "")
    : "",
  query: (url.searchParams.get("q") ?? "").trim().slice(0, 80),
  region: regions.has(url.searchParams.get("region") ?? "")
    ? (url.searchParams.get("region") ?? "")
    : "",
  selectionType: selectionTypes.has(url.searchParams.get("selection") ?? "")
    ? (url.searchParams.get("selection") ?? "")
    : "",
  soon: url.searchParams.get("soon") === "1",
  vendorType: vendorValues.has(url.searchParams.get("vendor") ?? "")
    ? (url.searchParams.get("vendor") ?? "")
    : "",
});
const listOpportunities = async (database: D1Database, filters: Filters) => {
  const conditions = ["status = 'active'", "deadline >= ?"];
  const values: (number | string)[] = [day()];
  if (filters.query) {
    const escaped = filters.query
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    conditions.push(
      "(organizer_name LIKE ? ESCAPE '\\' OR event_name LIKE ? ESCAPE '\\' OR prefecture LIKE ? ESCAPE '\\')",
    );
    values.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
  }
  for (const [column, value] of [
    ["region", filters.region],
    ["event_type", filters.eventType],
    ["environment", filters.environment],
    ["fee_type", filters.feeType],
    ["selection_type", filters.selectionType],
  ] as const) {
    if (value) {
      conditions.push(`${column} = ?`);
      values.push(value);
    }
  }
  if (filters.vendorType) {
    conditions.push("vendor_types LIKE ?");
    values.push(`%"${filters.vendorType}"%`);
  }
  if (filters.soon) {
    conditions.push("deadline <= ?");
    values.push(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  }
  return database
    .prepare(
      `SELECT * FROM opportunities WHERE ${conditions.join(" AND ")} ORDER BY deadline ASC, event_start ASC, updated_at DESC LIMIT 100`,
    )
    .bind(...values)
    .all<OpportunityRow>();
};

const SelectOptions = <T extends string>(props: {
  current?: string;
  labels: Record<T, string>;
  placeholder: string;
}) => (
  <>
    <option value="">{props.placeholder}</option>
    {Object.entries(props.labels).map(([value, label]) => (
      <option selected={props.current === value} value={value}>
        {String(label)}
      </option>
    ))}
  </>
);
const Layout = (props: {
  children: Child;
  description: string;
  noindex?: boolean;
  path?: string;
  title: string;
}) => {
  const url = `${canonicalOrigin}${props.path ?? "/"}`;
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>{props.title}</title>
        <meta content={props.description} name="description" />
        <meta content={props.noindex ? "noindex, nofollow" : "index, follow"} name="robots" />
        <link href={url} rel="canonical" />
        <meta content="website" property="og:type" />
        <meta content={props.title} property="og:title" />
        <meta content={props.description} property="og:description" />
        <meta content={`${canonicalOrigin}/og.png`} property="og:image" />
        <meta content={url} property="og:url" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content="#24416c" name="theme-color" />
        <link href="/favicon.png" rel="icon" type="image/png" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/styles.css" rel="stylesheet" />
      </head>
      <body>
        <a class="skip-link" href="#main">
          本文へ
        </a>
        <header class="site-header">
          <a class="brand" href="/">
            <span class="brand-awning" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
            </span>
            <b>出店札</b>
          </a>
          <nav aria-label="主なページ">
            <a href="/list">募集を探す</a>
            <a href="/#post">募集を載せる</a>
            <a href="/guide">使い方</a>
          </nav>
        </header>
        {props.children}
        <footer>
          <a href="/privacy">安全と保存</a>
          <a href="https://github.com/yhay81/shutten-fuda">公開コード</a>
          <span>応募前に元の募集要項を確認してください。</span>
        </footer>
      </body>
    </html>
  );
};
const OpportunityForm = (props: { editing?: boolean }) => (
  <form class="opportunity-form" data-opportunity-form>
    <div class="form-grid">
      <label>
        <span>主催者・運営名</span>
        <input maxlength={80} name="organizerName" required />
      </label>
      <label>
        <span>催事名</span>
        <input maxlength={100} name="eventName" required />
      </label>
      <label class="wide">
        <span>短い案内</span>
        <textarea maxlength={300} name="summary" rows={3}></textarea>
        <small>連絡先やURLは入れず、出店内容の要点だけ。</small>
      </label>
      <label>
        <span>地域</span>
        <select name="region" required>
          <SelectOptions labels={regionLabels} placeholder="選択" />
        </select>
      </label>
      <label>
        <span>都道府県</span>
        <input maxlength={8} minlength={2} name="prefecture" required />
      </label>
      <label>
        <span>催事種別</span>
        <select name="eventType" required>
          <SelectOptions labels={eventLabels} placeholder="選択" />
        </select>
      </label>
      <label>
        <span>会場</span>
        <select name="environment" required>
          <SelectOptions labels={environmentLabels} placeholder="選択" />
        </select>
      </label>
      <fieldset class="wide">
        <legend>募集する出店</legend>
        <div class="check-grid">
          {Object.entries(vendorLabels).map(([value, label]) => (
            <label>
              <input name="vendorTypes" type="checkbox" value={value} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span>出店料</span>
        <select name="feeType" required>
          <SelectOptions labels={feeLabels} placeholder="選択" />
        </select>
      </label>
      <div class="fee-fields">
        <label>
          <span>最低（円）</span>
          <input min={0} max={500000} name="feeMin" type="number" value="0" />
        </label>
        <label>
          <span>最高（円）</span>
          <input min={0} max={500000} name="feeMax" type="number" value="0" />
        </label>
      </div>
      <label>
        <span>決まり方</span>
        <select name="selectionType" required>
          <SelectOptions labels={selectionLabels} placeholder="選択" />
        </select>
      </label>
      <label>
        <span>応募方法</span>
        <select name="applicationMethod" required>
          <SelectOptions labels={applicationLabels} placeholder="選択" />
        </select>
      </label>
      <label>
        <span>応募締切</span>
        <input name="deadline" required type="date" />
      </label>
      <div class="event-dates">
        <label>
          <span>開催初日</span>
          <input name="eventStart" required type="date" />
        </label>
        <label>
          <span>開催最終日</span>
          <input name="eventEnd" required type="date" />
        </label>
      </div>
      <label class="wide">
        <span>公式の募集要項URL</span>
        <input maxlength={500} name="sourceUrl" placeholder="https://…" required type="url" />
        <small>公開中の主催者・自治体等のHTTPSページ。</small>
      </label>
    </div>
    <div class="form-submit">
      <button class="primary-button" type="submit">
        {props.editing ? "募集札を更新する" : "募集札を公開する"}
      </button>
      <p data-form-state aria-live="polite"></p>
    </div>
  </form>
);
const MarketScene = () => (
  <div class="market-scene" aria-hidden="true">
    <div class="route-line">
      <i></i>
      <i></i>
      <i></i>
    </div>
    <div class="stall stall-a">
      <span></span>
      <b>HANDMADE</b>
      <em>8/18</em>
    </div>
    <div class="stall stall-b">
      <span></span>
      <b>FOOD</b>
      <em>8/21</em>
    </div>
    <div class="stall stall-c">
      <span></span>
      <b>WORKSHOP</b>
      <em>8/25</em>
    </div>
    <div class="application-gate">
      <span>ENTRY</span>
      <i>→</i>
    </div>
    <div class="calendar-board">
      <i></i>
      <i></i>
      <i></i>
      <b>締切順</b>
    </div>
  </div>
);
const Home = () => (
  <Layout
    description="マルシェ、ハンドメイド、フリマ、キッチンカー、ワークショップの出店募集を、締切と条件から探す。"
    title="出店札｜次の売り場を、締切から。"
  >
    <main id="main">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">MARKET APPLICATIONS</p>
          <h1>次の売り場を、締切から。</h1>
          <p>地域、出店内容、屋内外、料金、選考を一枚で見比べ、応募は主催者の募集要項へ。</p>
          <div class="hero-actions">
            <a class="primary-button" href="/list">
              募集を探す
            </a>
            <a class="quiet-button" href="#post">
              募集を載せる
            </a>
          </div>
        </div>
        <MarketScene />
      </section>
      <section class="browse-lane">
        <div>
          <p class="section-kicker">COMPARE THE STALLS</p>
          <h2>探す順番が、見える市場</h2>
        </div>
        <div class="lane-steps">
          <article>
            <span>1</span>
            <b>締切</b>
            <p>近い募集から確認</p>
          </article>
          <article>
            <span>2</span>
            <b>条件</b>
            <p>出店内容と費用を比較</p>
          </article>
          <article>
            <span>3</span>
            <b>正本</b>
            <p>公式要項から応募</p>
          </article>
        </div>
      </section>
      <section class="post-section" id="post">
        <div class="post-intro">
          <p class="section-kicker">HANG A LABEL</p>
          <h2>募集札を掛ける</h2>
          <p>比較に必要な公開条件だけを載せます。応募者情報や書類は受け取りません。</p>
          <div class="source-rule">
            <i></i>
            <span>公式の募集要項</span>
            <b>HTTPS</b>
          </div>
        </div>
        <OpportunityForm />
      </section>
      <dialog data-result-dialog>
        <button class="dialog-close" data-dialog-close type="button" aria-label="閉じる">
          ×
        </button>
        <h2>募集札を掛けました</h2>
        <p>編集URLは再表示できません。安全な場所へ保存してください。</p>
        <label>
          <span>公開URL</span>
          <input data-public-url readonly />
          <button data-copy="public" type="button">
            コピー
          </button>
        </label>
        <label>
          <span>編集URL</span>
          <input data-edit-url readonly />
          <button data-copy="edit" type="button">
            コピー
          </button>
        </label>
        <div class="dialog-actions">
          <a class="primary-button" data-open-public>
            公開札を見る
          </a>
          <a class="quiet-button" data-open-editor>
            編集画面へ
          </a>
        </div>
      </dialog>
    </main>
    <script src="/app.js" type="module"></script>
  </Layout>
);
const OpportunityCard = (props: { row: OpportunityRow }) => {
  const input = opportunityToInput(props.row);
  return (
    <article class="opportunity-card">
      <div class="card-awning" data-tone={input.eventType}>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </div>
      <div class="card-top">
        <span>{eventLabels[input.eventType]}</span>
        <time datetime={input.deadline}>締切 {input.deadline}</time>
      </div>
      <p class="organizer">{input.organizerName}</p>
      <h3>
        <a href={`/opportunities/${props.row.slug}`}>{input.eventName}</a>
      </h3>
      <p>{input.summary}</p>
      <div class="tag-row">
        {input.vendorTypes.map((value) => (
          <span>{vendorLabels[value]}</span>
        ))}
      </div>
      <dl>
        <div>
          <dt>場所</dt>
          <dd>
            {input.prefecture}・{environmentLabels[input.environment]}
          </dd>
        </div>
        <div>
          <dt>出店料</dt>
          <dd>{feeText(input)}</dd>
        </div>
        <div>
          <dt>決定</dt>
          <dd>{selectionLabels[input.selectionType]}</dd>
        </div>
        <div>
          <dt>開催</dt>
          <dd>
            {input.eventStart === input.eventEnd
              ? input.eventStart
              : `${input.eventStart}〜${input.eventEnd}`}
          </dd>
        </div>
      </dl>
      <a class="card-link" href={`/opportunities/${props.row.slug}`}>
        条件を見る <span>→</span>
      </a>
    </article>
  );
};
const Directory = (props: { filters: Filters; rows: OpportunityRow[] }) => (
  <Layout
    description="出店募集中のマルシェ、ハンドメイド、フリマ、キッチンカー、ワークショップを締切順に絞り込む。"
    path="/list"
    title="出店募集を探す｜出店札"
  >
    <main class="directory-page" data-directory-root id="main">
      <header class="page-intro">
        <div class="page-symbol search" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">FIND A STALL</p>
          <h1>締切の近い出店募集</h1>
          <p>条件を比べ、空き状況と提出物は元の募集要項で確かめます。</p>
        </div>
      </header>
      <form action="/list" class="filter-bar" method="get">
        <label class="search-field">
          <span>催事・主催者・都道府県</span>
          <input
            maxlength={80}
            name="q"
            value={props.filters.query}
            placeholder="マルシェ、実行委員会、東京都"
          />
        </label>
        <label>
          <span>地域</span>
          <select name="region">
            <SelectOptions
              current={props.filters.region}
              labels={regionLabels}
              placeholder="すべて"
            />
          </select>
        </label>
        <label>
          <span>催事</span>
          <select name="type">
            <SelectOptions
              current={props.filters.eventType}
              labels={eventLabels}
              placeholder="すべて"
            />
          </select>
        </label>
        <label>
          <span>出店内容</span>
          <select name="vendor">
            <SelectOptions
              current={props.filters.vendorType}
              labels={vendorLabels}
              placeholder="すべて"
            />
          </select>
        </label>
        <label>
          <span>会場</span>
          <select name="environment">
            <SelectOptions
              current={props.filters.environment}
              labels={environmentLabels}
              placeholder="すべて"
            />
          </select>
        </label>
        <label>
          <span>料金</span>
          <select name="fee">
            <SelectOptions
              current={props.filters.feeType}
              labels={feeLabels}
              placeholder="すべて"
            />
          </select>
        </label>
        <label>
          <span>決まり方</span>
          <select name="selection">
            <SelectOptions
              current={props.filters.selectionType}
              labels={selectionLabels}
              placeholder="すべて"
            />
          </select>
        </label>
        <label class="check-line">
          <input checked={props.filters.soon} name="soon" type="checkbox" value="1" />
          <span>7日以内に締切</span>
        </label>
        <button class="primary-button" type="submit">
          絞り込む
        </button>
      </form>
      <div class="directory-heading">
        <div>
          <p class="section-kicker">OPEN LABELS</p>
          <h2>
            {props.rows.length ? `${props.rows.length}件の募集札` : "条件に合う募集札はありません"}
          </h2>
        </div>
        <a class="quiet-button" href="/#post">
          募集札を載せる
        </a>
      </div>
      {props.rows.length ? (
        <section class="opportunity-grid" aria-label="出店募集一覧">
          {props.rows.map((row) => (
            <OpportunityCard row={row} />
          ))}
        </section>
      ) : (
        <section class="empty-market">
          <i></i>
          <i></i>
          <p>条件を減らすか、公開中の公式募集を最初の札にしてください。</p>
        </section>
      )}
    </main>
    <script src="/directory.js" type="module"></script>
  </Layout>
);
const Detail = (props: { row: OpportunityRow }) => {
  const input = opportunityToInput(props.row);
  return (
    <Layout
      description={`${input.organizerName}「${input.eventName}」の出店募集札。締切${input.deadline}。`}
      path={`/opportunities/${props.row.slug}`}
      title={`${input.eventName}｜${input.organizerName}｜出店札`}
    >
      <main
        class="detail-page"
        data-opportunity-id={props.row.id}
        data-opportunity-root
        data-slug={props.row.slug}
        id="main"
      >
        <header class="detail-hero">
          <div class="detail-stall" aria-hidden="true">
            <div>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
            <span>{eventLabels[input.eventType]}</span>
            <b>{input.prefecture}</b>
            <time>{input.deadline}</time>
          </div>
          <div>
            <p class="eyebrow">{input.organizerName}</p>
            <h1>{input.eventName}</h1>
            <p>{input.summary}</p>
            <div class="tag-row">
              {input.vendorTypes.map((value) => (
                <span>{vendorLabels[value]}</span>
              ))}
            </div>
          </div>
        </header>
        <div class="detail-grid">
          <section class="opportunity-facts">
            <h2>出店の見取り図</h2>
            <dl>
              <div>
                <dt>地域</dt>
                <dd>
                  {regionLabels[input.region]}・{input.prefecture}
                </dd>
              </div>
              <div>
                <dt>催事</dt>
                <dd>{eventLabels[input.eventType]}</dd>
              </div>
              <div>
                <dt>会場</dt>
                <dd>{environmentLabels[input.environment]}</dd>
              </div>
              <div>
                <dt>出店料</dt>
                <dd>{feeText(input)}</dd>
              </div>
              <div>
                <dt>決まり方</dt>
                <dd>{selectionLabels[input.selectionType]}</dd>
              </div>
              <div>
                <dt>応募方法</dt>
                <dd>{applicationLabels[input.applicationMethod]}</dd>
              </div>
              <div>
                <dt>開催</dt>
                <dd>
                  {input.eventStart === input.eventEnd
                    ? input.eventStart
                    : `${input.eventStart}〜${input.eventEnd}`}
                </dd>
              </div>
              <div class="deadline-fact">
                <dt>締切</dt>
                <dd>
                  <time datetime={input.deadline}>{input.deadline}</time>
                </dd>
              </div>
            </dl>
          </section>
          <aside class="source-panel">
            <div class="application-gate small" aria-hidden="true">
              <span>ENTRY</span>
              <i>→</i>
            </div>
            <h2>主催者の募集要項へ</h2>
            <p>空き状況、提出書類、許可、搬入、キャンセル条件は必ず正本で確認してください。</p>
            <a
              class="primary-button"
              data-source-open
              href={input.sourceUrl}
              rel="noopener noreferrer"
            >
              元の募集要項を開く
            </a>
            <button class="report-button" data-report-open type="button">
              掲載内容を報告
            </button>
            <form data-report-form hidden>
              <label>
                <span>理由</span>
                <select name="reason">
                  <option value="closed">募集終了</option>
                  <option value="impersonation">公式ではない</option>
                  <option value="harmful">危険な誘導</option>
                  <option value="other">その他</option>
                </select>
              </label>
              <button type="submit">報告する</button>
              <p data-report-state aria-live="polite"></p>
            </form>
          </aside>
        </div>
      </main>
      <script src="/opportunity.js" type="module"></script>
    </Layout>
  );
};
const EditPage = (props: { slug: string }) => (
  <Layout
    description="募集札の内容、締切、公開状態を編集する。"
    noindex
    path={`/edit/${props.slug}`}
    title="募集札を編集｜出店札"
  >
    <main class="edit-page" data-editor-root data-slug={props.slug} id="main">
      <header class="page-intro">
        <div class="page-symbol edit" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">LABEL DESK</p>
          <h1>募集札を整える</h1>
          <p>編集鍵で更新し、募集が終わったら一覧から閉じます。</p>
        </div>
      </header>
      <p class="editor-status" data-editor-status aria-live="polite">
        編集鍵を確認しています…
      </p>
      <section data-editor-content hidden>
        <OpportunityForm editing />
        <div class="danger-zone">
          <button class="quiet-button" data-action="close" type="button">
            募集を終了する
          </button>
          <button class="danger-button" data-action="delete" type="button">
            募集札を削除する
          </button>
        </div>
      </section>
    </main>
    <script src="/edit.js" type="module"></script>
  </Layout>
);
const Guide = () => (
  <Layout
    description="出店札で募集条件を比べ、元の募集要項から応募する手順。"
    path="/guide"
    title="使い方｜出店札"
  >
    <main class="prose-page" id="main">
      <header class="page-intro">
        <div class="page-symbol guide" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">HOW TO READ LABELS</p>
          <h1>札で比べ、正本で決める</h1>
          <p>候補探しと応募を分けることで、条件を見落としにくくします。</p>
        </div>
      </header>
      <div class="step-market">
        <section>
          <b>1</b>
          <h2>締切で並べる</h2>
          <p>応募できる募集を近い順に見ます。</p>
        </section>
        <section>
          <b>2</b>
          <h2>条件を比べる</h2>
          <p>地域、内容、会場、料金、選考を絞ります。</p>
        </section>
        <section>
          <b>3</b>
          <h2>正本を読む</h2>
          <p>空き、提出物、許可、搬入は主催者の要項で確認します。</p>
        </section>
      </div>
    </main>
  </Layout>
);
const Privacy = () => (
  <Layout
    description="出店札が保存する公開募集条件、編集鍵、報告、保持期限。"
    path="/privacy"
    title="安全と保存｜出店札"
  >
    <main class="prose-page" id="main">
      <header class="page-intro">
        <div class="page-symbol privacy" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <p class="eyebrow">SAFETY & STORAGE</p>
          <h1>応募情報を預からない</h1>
          <p>公開比較に必要な募集条件だけを保存し、応募は主催者の正本へ分けます。</p>
        </div>
      </header>
      <div class="privacy-grid">
        <section>
          <h2>保存するもの</h2>
          <p>
            主催者、催事、要約、地域、種別、出店内容、会場、料金、選考、方法、日程、締切、元URL、公開状態を保存します。
          </p>
        </section>
        <section>
          <h2>保存しないもの</h2>
          <p>
            氏名、メール、電話、住所、応募文、許可証、車両情報、画像、チャット、決済を受け取りません。
          </p>
        </section>
        <section>
          <h2>期限と報告</h2>
          <p>
            期限切れ・終了・非表示の募集は30日後、匿名イベントは45日後に削除します。独立3件の報告で非表示になります。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'none'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: [],
    },
    crossOriginEmbedderPolicy: false,
    permissionsPolicy: { camera: [], geolocation: [], microphone: [], payment: [] },
    referrerPolicy: "no-referrer",
  }),
);
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("X-Request-Id", c.get("requestId"));
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()");
  await next();
});
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
app.use(
  "*",
  jsxRenderer(({ children }) => html`${children}`),
);

app.get("/", (c) => c.render(<Home />));
app.get("/guide", (c) => c.render(<Guide />));
app.get("/privacy", (c) => c.render(<Privacy />));
app.get("/list", async (c) => {
  const filters = filtersFrom(new URL(c.req.url));
  const rows = (await listOpportunities(c.env.DB, filters)).results;
  c.header("Cache-Control", "no-store");
  return c.render(<Directory filters={filters} rows={rows} />);
});
app.get("/opportunities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = slugPattern.test(slug) ? await findOpportunity(c.env.DB, slug, true) : null;
  if (!row) return c.notFound();
  c.header("Cache-Control", "no-store");
  return c.render(<Detail row={row} />);
});
app.get("/edit/:slug", (c) => {
  const slug = c.req.param("slug");
  if (!slugPattern.test(slug)) return c.notFound();
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.render(<EditPage slug={slug} />);
});
app.get("/sitemap.xml", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT slug FROM opportunities WHERE status = 'active' AND deadline >= ? ORDER BY updated_at DESC LIMIT 500",
  )
    .bind(day())
    .all<{ slug: string }>();
  const paths = [
    "/",
    "/list",
    "/guide",
    "/privacy",
    ...rows.results.map((row) => `/opportunities/${row.slug}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${canonicalOrigin}${path}</loc></url>`).join("\n")}\n</urlset>`;
  c.header("Cache-Control", "public, max-age=300");
  c.header("Content-Type", "application/xml; charset=UTF-8");
  return c.body(body);
});
app.get("/health", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    reporting: Boolean(c.env.REPORT_HASH_KEY?.length && c.env.REPORT_HASH_KEY.length >= 32),
  });
});

app.post("/api/opportunities", async (c) => {
  if (!validBoundary(c.req.raw, 12288)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  if (!sessionId) return c.json({ error: "invalid_request" }, 400);
  try {
    const input = await parseJson(c.req.raw, 12288);
    if (!validOpportunityInput(input)) return c.json({ error: "invalid_opportunity" }, 400);
    const createdToday = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM product_events WHERE name = 'opportunity_created' AND session_id = ? AND day = ?",
    )
      .bind(sessionId, day())
      .first<{ count: number }>();
    if ((createdToday?.count ?? 0) >= 3) return c.json({ error: "daily_limit" }, 429);
    const sourceUrl = normalizeUrl(input.sourceUrl);
    const sourceHash = await sha256(sourceUrl);
    const duplicate = await c.env.DB.prepare(
      "SELECT slug FROM opportunities WHERE source_url_hash = ? LIMIT 1",
    )
      .bind(sourceHash)
      .first<{ slug: string }>();
    if (duplicate) return c.json({ error: "duplicate_source", slug: duplicate.slug }, 409);
    const id = crypto.randomUUID();
    const slug = randomBase64Url(9);
    const capability = randomBase64Url(32);
    const timestamp = nowSeconds();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO opportunities (id, slug, capability_hash, organizer_name, event_name, summary, region, prefecture, event_type, vendor_types, environment, fee_type, fee_min, fee_max, selection_type, application_method, source_url, source_url_hash, deadline, event_start, event_end, status, report_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
      ).bind(
        id,
        slug,
        await sha256(capability),
        input.organizerName,
        input.eventName,
        input.summary,
        input.region,
        input.prefecture,
        input.eventType,
        JSON.stringify(input.vendorTypes),
        input.environment,
        input.feeType,
        input.feeMin,
        input.feeMax,
        input.selectionType,
        input.applicationMethod,
        sourceUrl,
        sourceHash,
        input.deadline,
        input.eventStart,
        input.eventEnd,
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT INTO product_events (name, session_id, opportunity_id, day, created_at, is_qa) VALUES ('opportunity_created', ?, ?, ?, ?, ?)`,
      ).bind(sessionId, id, day(), timestamp, qaFrom(c.req.raw)),
    ]);
    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        editUrl: `${origin}/edit/${slug}#${capability}`,
        opportunityId: id,
        publicUrl: `${origin}/opportunities/${slug}`,
        slug,
      },
      201,
    );
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});
app.get("/api/opportunities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = slugPattern.test(slug)
    ? await authorizedOpportunity(c.req.raw, c.env.DB, slug)
    : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ opportunity: opportunityToInput(row), status: row.status });
});
app.put("/api/opportunities/:slug", async (c) => {
  if (!validBoundary(c.req.raw, 12288)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  const row =
    sessionId && slugPattern.test(slug)
      ? await authorizedOpportunity(c.req.raw, c.env.DB, slug)
      : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  try {
    const input = await parseJson(c.req.raw, 12288);
    if (!validOpportunityInput(input)) return c.json({ error: "invalid_opportunity" }, 400);
    const sourceUrl = normalizeUrl(input.sourceUrl);
    const sourceHash = await sha256(sourceUrl);
    if (
      await c.env.DB.prepare(
        "SELECT id FROM opportunities WHERE source_url_hash = ? AND id <> ? LIMIT 1",
      )
        .bind(sourceHash, row.id)
        .first()
    )
      return c.json({ error: "duplicate_source" }, 409);
    const timestamp = nowSeconds();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE opportunities SET organizer_name=?, event_name=?, summary=?, region=?, prefecture=?, event_type=?, vendor_types=?, environment=?, fee_type=?, fee_min=?, fee_max=?, selection_type=?, application_method=?, source_url=?, source_url_hash=?, deadline=?, event_start=?, event_end=?, status='active', report_count=0, updated_at=? WHERE id=?`,
      ).bind(
        input.organizerName,
        input.eventName,
        input.summary,
        input.region,
        input.prefecture,
        input.eventType,
        JSON.stringify(input.vendorTypes),
        input.environment,
        input.feeType,
        input.feeMin,
        input.feeMax,
        input.selectionType,
        input.applicationMethod,
        sourceUrl,
        sourceHash,
        input.deadline,
        input.eventStart,
        input.eventEnd,
        timestamp,
        row.id,
      ),
      c.env.DB.prepare("DELETE FROM opportunity_reports WHERE opportunity_id = ?").bind(row.id),
      c.env.DB.prepare(
        `INSERT INTO product_events (name, session_id, opportunity_id, day, created_at, is_qa) VALUES ('opportunity_updated', ?, ?, ?, ?, ?)`,
      ).bind(sessionId, row.id, day(), timestamp, qaFrom(c.req.raw)),
    ]);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});
app.post("/api/opportunities/:slug/close", async (c) => {
  if (!validBoundary(c.req.raw, 128)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  const row =
    sessionId && slugPattern.test(slug)
      ? await authorizedOpportunity(c.req.raw, c.env.DB, slug)
      : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  const input = await parseJson(c.req.raw, 128).catch(() => null);
  if (!isExactObject(input, [])) return c.json({ error: "invalid_request" }, 400);
  const timestamp = nowSeconds();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE opportunities SET status='closed', updated_at=? WHERE id=?").bind(
      timestamp,
      row.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO product_events (name, session_id, opportunity_id, day, created_at, is_qa) VALUES ('opportunity_closed', ?, ?, ?, ?, ?)`,
    ).bind(sessionId, row.id, day(), timestamp, qaFrom(c.req.raw)),
  ]);
  return c.json({ ok: true });
});
app.delete("/api/opportunities/:slug", async (c) => {
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  const row =
    sessionId && slugPattern.test(slug)
      ? await authorizedOpportunity(c.req.raw, c.env.DB, slug)
      : null;
  if (!row) return c.json({ error: "not_found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM opportunities WHERE id=?").bind(row.id),
    c.env.DB.prepare(
      `INSERT INTO product_events (name, session_id, opportunity_id, day, created_at, is_qa) VALUES ('opportunity_deleted', ?, ?, ?, ?, ?)`,
    ).bind(sessionId, row.id, day(), nowSeconds(), qaFrom(c.req.raw)),
  ]);
  return c.body(null, 204);
});
app.post("/api/opportunities/:slug/report", async (c) => {
  if (!validBoundary(c.req.raw, 512)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  const slug = c.req.param("slug");
  if (!sessionId || !slugPattern.test(slug)) return c.json({ error: "invalid_request" }, 400);
  const row = await findOpportunity(c.env.DB, slug, true);
  if (!row) return c.json({ error: "not_found" }, 404);
  try {
    const input = await parseJson(c.req.raw, 512);
    if (
      !isExactObject(input, ["reason"]) ||
      !reportReasons.has(String((input as { reason?: unknown }).reason))
    )
      return c.json({ error: "invalid_report" }, 400);
    const fingerprint = await reportFingerprint(
      c.req.raw,
      c.env.REPORT_HASH_KEY,
      row.id,
      sessionId,
    );
    if (!fingerprint) return c.json({ error: "reporting_unavailable" }, 503);
    const timestamp = nowSeconds();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO opportunity_reports (opportunity_id, session_id, reporter_hash, reason, created_at, is_qa) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        sessionId,
        fingerprint,
        (input as { reason: string }).reason,
        timestamp,
        qaFrom(c.req.raw),
      )
      .run();
    const reports = await c.env.DB.prepare(
      "SELECT COUNT(DISTINCT session_id) AS count FROM opportunity_reports WHERE opportunity_id=? AND is_qa=0",
    )
      .bind(row.id)
      .first<{ count: number }>();
    const hidden = (reports?.count ?? 0) >= 3;
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE opportunities SET report_count=?, status=CASE WHEN ? THEN 'hidden' ELSE status END, updated_at=CASE WHEN ? THEN ? ELSE updated_at END WHERE id=?`,
      ).bind(reports?.count ?? 0, hidden ? 1 : 0, hidden ? 1 : 0, timestamp, row.id),
      c.env.DB.prepare(
        `INSERT INTO product_events (name, session_id, opportunity_id, day, created_at, is_qa) VALUES ('opportunity_reported', ?, ?, ?, ?, ?)`,
      ).bind(sessionId, row.id, day(), timestamp, qaFrom(c.req.raw)),
    ]);
    return c.json({ hidden, ok: true }, 202);
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});
app.post("/api/events", async (c) => {
  if (!validBoundary(c.req.raw, 512)) return c.json({ error: "invalid_request" }, 400);
  const sessionId = sessionFrom(c.req.raw);
  if (!sessionId) return c.json({ error: "invalid_request" }, 400);
  try {
    const input = await parseJson(c.req.raw, 512);
    if (!isExactObject(input, ["name", "opportunityId"]))
      return c.json({ error: "invalid_event" }, 400);
    const { name, opportunityId } = input as { name: unknown; opportunityId: unknown };
    if (
      typeof name !== "string" ||
      !browserEventNames.has(name) ||
      typeof opportunityId !== "string" ||
      (opportunityId !== "" && !sessionPattern.test(opportunityId))
    )
      return c.json({ error: "invalid_event" }, 400);
    await insertEvent(c.env.DB, name, sessionId, opportunityId, qaFrom(c.req.raw));
    return c.json({ ok: true }, 202);
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
});
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  c.status(404);
  return c.render(
    <Layout description="指定された募集札は見つかりません。" noindex title="見つかりません｜出店札">
      <main class="not-found" id="main">
        <div class="empty-stall" aria-hidden="true">
          <i></i>
          <span>404</span>
        </div>
        <p class="eyebrow">NO STALL HERE</p>
        <h1>その募集札は、受付を終えています</h1>
        <p>締切が過ぎたか、主催者が募集を終了した可能性があります。</p>
        <a class="primary-button" href="/list">
          ほかの募集を探す
        </a>
      </main>
    </Layout>,
  );
});

export const scheduled = async (
  _controller: ScheduledController,
  env: Bindings,
  _context: ExecutionContext,
) => {
  const timestamp = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM product_events WHERE created_at < ?").bind(
      timestamp - eventLifetime,
    ),
    env.DB.prepare(
      "DELETE FROM opportunities WHERE (deadline < ? OR status <> 'active') AND updated_at < ?",
    ).bind(day(), timestamp - inactiveLifetime),
  ]);
};

export default { fetch: app.fetch, scheduled };
export { app };
