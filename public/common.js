const storageKey = "shutten-fuda-session";
const visitKey = "shutten-fuda-visited";
const fallbackUuid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const sessionId = (() => {
  const saved = localStorage.getItem(storageKey);
  if (saved) return saved;
  const created = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
  localStorage.setItem(storageKey, created);
  return created;
})();
export const isQa = new URLSearchParams(location.search).get("qa") === "1";
export const jsonHeaders = (extra = {}) => ({
  "content-type": "application/json",
  "x-shutten-fuda-session": sessionId,
  ...(isQa ? { "x-shutten-fuda-qa": "1" } : {}),
  ...extra,
});
export const capabilityFromHash = () => {
  const value = location.hash.slice(1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
};
export const sendEvent = (name, opportunityId = "") =>
  fetch("/api/events", {
    body: JSON.stringify({ name, opportunityId }),
    headers: jsonHeaders(),
    method: "POST",
  }).catch(() => undefined);
export const markVisit = (name = "visited", opportunityId = "") => {
  void sendEvent(name, opportunityId);
  if (localStorage.getItem(visitKey)) void sendEvent("returned", opportunityId);
  localStorage.setItem(visitKey, new Date().toISOString().slice(0, 10));
};
export const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
};
export const errorText = (code) =>
  ({
    daily_limit: "今日は3件まで掲載できます。続きは明日お試しください。",
    duplicate_source: "同じ募集要項の募集札がすでにあります。",
    invalid_opportunity:
      "入力を確かめてください。締切と開催日は範囲内、元ページはHTTPSにしてください。",
    not_found: "編集鍵が一致しないか、募集札は削除されています。",
  })[code] || "保存できませんでした。少し待ってもう一度お試しください。";
export const copyInput = async (input, button) => {
  await navigator.clipboard.writeText(input.value);
  const prior = button.textContent;
  button.textContent = "コピー済み";
  setTimeout(() => (button.textContent = prior), 1500);
};
export const formInput = (form) => {
  const data = new FormData(form);
  return {
    applicationMethod: String(data.get("applicationMethod") || ""),
    deadline: String(data.get("deadline") || ""),
    environment: String(data.get("environment") || ""),
    eventEnd: String(data.get("eventEnd") || ""),
    eventName: String(data.get("eventName") || "").trim(),
    eventStart: String(data.get("eventStart") || ""),
    eventType: String(data.get("eventType") || ""),
    feeMax: Number(data.get("feeMax") || 0),
    feeMin: Number(data.get("feeMin") || 0),
    feeType: String(data.get("feeType") || ""),
    organizerName: String(data.get("organizerName") || "").trim(),
    prefecture: String(data.get("prefecture") || "").trim(),
    region: String(data.get("region") || ""),
    selectionType: String(data.get("selectionType") || ""),
    sourceUrl: String(data.get("sourceUrl") || "").trim(),
    summary: String(data.get("summary") || "").trim(),
    vendorTypes: data.getAll("vendorTypes").map(String),
  };
};
export const populateForm = (form, opportunity) => {
  for (const [name, value] of Object.entries(opportunity)) {
    if (name === "vendorTypes") {
      for (const input of form.querySelectorAll('input[name="vendorTypes"]'))
        input.checked = value.includes(input.value);
      continue;
    }
    const field = form.elements.namedItem(name);
    if (field) field.value = String(value);
  }
  syncFeeFields(form);
};
export const setDateBounds = (form) => {
  const now = Date.now();
  const deadline = form.elements.namedItem("deadline");
  const start = form.elements.namedItem("eventStart");
  const end = form.elements.namedItem("eventEnd");
  if (
    !(deadline instanceof HTMLInputElement) ||
    !(start instanceof HTMLInputElement) ||
    !(end instanceof HTMLInputElement)
  )
    return;
  const tomorrow = new Date(now + 86400000).toISOString().slice(0, 10);
  deadline.min = tomorrow;
  deadline.max = new Date(now + 180 * 86400000).toISOString().slice(0, 10);
  start.min = tomorrow;
  start.max = new Date(now + 365 * 86400000).toISOString().slice(0, 10);
  end.min = tomorrow;
  end.max = new Date(now + 379 * 86400000).toISOString().slice(0, 10);
  if (!deadline.value) deadline.value = new Date(now + 21 * 86400000).toISOString().slice(0, 10);
  if (!start.value) start.value = new Date(now + 45 * 86400000).toISOString().slice(0, 10);
  if (!end.value) end.value = start.value;
  const sync = () => {
    start.min = deadline.value || tomorrow;
    if (start.value < start.min) start.value = start.min;
    end.min = start.value;
    end.max = new Date(Date.parse(`${start.value}T00:00:00Z`) + 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    if (end.value < end.min || end.value > end.max) end.value = start.value;
  };
  deadline.addEventListener("change", sync);
  start.addEventListener("change", sync);
  sync();
};
export const syncFeeFields = (form) => {
  const type = form.elements.namedItem("feeType");
  const minimum = form.elements.namedItem("feeMin");
  const maximum = form.elements.namedItem("feeMax");
  if (
    !(type instanceof HTMLSelectElement) ||
    !(minimum instanceof HTMLInputElement) ||
    !(maximum instanceof HTMLInputElement)
  )
    return;
  const paid = type.value === "paid";
  minimum.disabled = !paid;
  maximum.disabled = !paid;
  if (!paid) {
    minimum.value = "0";
    maximum.value = "0";
  }
};
export const prepareForm = (form) => {
  setDateBounds(form);
  const type = form.elements.namedItem("feeType");
  if (type instanceof HTMLSelectElement) type.addEventListener("change", () => syncFeeFields(form));
  syncFeeFields(form);
};
