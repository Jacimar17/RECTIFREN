import { $, setActiveChip } from "./ui.js";

export function readUrlParams(currentFilter) {
  const params = new URLSearchParams(location.search);
  const filter = params.get("filter");
  const query = params.get("q");
  const viewFilter = filter && ["all","out","low"].includes(filter) ? filter : currentFilter;
  if (query) {
    const search = $("search");
    if (search) {
      search.value = query;
      if ($("btnClearSearch")) $("btnClearSearch").style.display = "flex";
    }
  }
  const chipMap = { all:"fAll", out:"fOut", low:"fLow" };
  setActiveChip(chipMap[viewFilter] || "fAll");
  return viewFilter;
}

export function pushUrlParams(viewFilter) {
  const query = $("search")?.value || "";
  const params = new URLSearchParams();
  if (viewFilter !== "all") params.set("filter", viewFilter);
  if (query) params.set("q", query);
  const value = params.toString();
  history.replaceState(null, "", value ? `?${value}` : location.pathname);
}
