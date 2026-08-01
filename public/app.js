import {
  copyInput,
  errorText,
  fetchJson,
  formInput,
  jsonHeaders,
  markVisit,
  prepareForm,
} from "/common.js";

const form = document.querySelector("[data-opportunity-form]");
const state = form.querySelector("[data-form-state]");
const dialog = document.querySelector("[data-result-dialog]");
prepareForm(form);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.textContent = "募集札を整えています…";
  try {
    const result = await fetchJson("/api/opportunities", {
      body: JSON.stringify(formInput(form)),
      headers: jsonHeaders(),
      method: "POST",
    });
    dialog.querySelector("[data-public-url]").value = result.publicUrl;
    dialog.querySelector("[data-edit-url]").value = result.editUrl;
    dialog.querySelector("[data-open-public]").href = result.publicUrl;
    dialog.querySelector("[data-open-editor]").href = result.editUrl;
    state.textContent = "";
    dialog.showModal();
  } catch (error) {
    state.textContent = errorText(error.message);
  }
});
for (const button of dialog.querySelectorAll("[data-copy]")) {
  button.addEventListener(
    "click",
    () => void copyInput(dialog.querySelector(`[data-${button.dataset.copy}-url]`), button),
  );
}
dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
markVisit();
