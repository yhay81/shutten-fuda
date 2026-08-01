import {
  capabilityFromHash,
  errorText,
  fetchJson,
  formInput,
  jsonHeaders,
  populateForm,
  prepareForm,
} from "/common.js";

const root = document.querySelector("[data-editor-root]");
const status = root.querySelector("[data-editor-status]");
const content = root.querySelector("[data-editor-content]");
const form = root.querySelector("[data-opportunity-form]");
const capability = capabilityFromHash();
const slug = root.dataset.slug;
const headers = () => jsonHeaders({ "x-shutten-fuda-capability": capability });
const load = async () => {
  if (!capability) throw new Error("not_found");
  const data = await fetchJson(`/api/opportunities/${slug}`, { headers: headers() });
  populateForm(form, data.opportunity);
  prepareForm(form);
  status.textContent =
    data.status === "active" ? "公開中" : "一覧では非公開です。更新すると再公開します。";
  content.hidden = false;
};
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const state = form.querySelector("[data-form-state]");
  state.textContent = "更新しています…";
  try {
    await fetchJson(`/api/opportunities/${slug}`, {
      body: JSON.stringify(formInput(form)),
      headers: headers(),
      method: "PUT",
    });
    state.textContent = "更新し、公開しました。";
    status.textContent = "公開中";
  } catch (error) {
    state.textContent = errorText(error.message);
  }
});
root.querySelector('[data-action="close"]').addEventListener("click", async () => {
  if (!confirm("一覧から募集を終了しますか？")) return;
  await fetchJson(`/api/opportunities/${slug}/close`, {
    body: "{}",
    headers: headers(),
    method: "POST",
  });
  status.textContent = "募集を終了しました。";
});
root.querySelector('[data-action="delete"]').addEventListener("click", async () => {
  if (!confirm("募集札を完全に削除しますか？")) return;
  await fetchJson(`/api/opportunities/${slug}`, { headers: headers(), method: "DELETE" });
  location.replace("/list");
});
load().catch((error) => {
  status.textContent = errorText(error.message);
});
