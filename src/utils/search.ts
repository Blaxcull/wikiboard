export function openSearchBox() {
  window.dispatchEvent(new CustomEvent("wikiboard:open-search"));
}

export function closeSearchBox() {
  window.dispatchEvent(new CustomEvent("wikiboard:close-search"));
}

export function toggleSearchBox() {
  window.dispatchEvent(new CustomEvent("wikiboard:toggle-search"));
}
