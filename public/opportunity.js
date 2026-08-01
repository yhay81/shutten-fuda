import { fetchJson, jsonHeaders, markVisit, sendEvent } from "/common.js";

const root = document.querySelector("[data-opportunity-root]");
const opportunityId = root.dataset.opportunityId;
markVisit("opportunity_opened", opportunityId);
document
  .querySelector("[data-source-open]")
  .addEventListener("click", () => void sendEvent("source_opened", opportunityId));
const open = document.querySelector("[data-report-open]");
const form = document.querySelector("[data-report-form]");
open.addEventListener("click", () => {
  form.hidden = !form.hidden;
  if (!form.hidden) form.querySelector("select").focus();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const state = form.querySelector("[data-report-state]");
  try {
    const data = new FormData(form);
    await fetchJson(`/api/opportunities/${root.dataset.slug}/report`, {
      body: JSON.stringify({ reason: String(data.get("reason") || "") }),
      headers: jsonHeaders(),
      method: "POST",
    });
    state.textContent = "報告を受け付けました。";
    form.querySelector("button").disabled = true;
  } catch {
    state.textContent = "報告できませんでした。時間をおいてお試しください。";
  }
});
