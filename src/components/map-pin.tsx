export function createPinElement(options: {
  rating: number;
  selected?: boolean;
  unavailable?: boolean;
  count?: number;
}): HTMLDivElement {
  const { rating, selected = false, unavailable = false, count } = options;
  const isCluster = count !== undefined;

  const el = document.createElement("div");

  // Base styles shared by all variants
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.borderRadius = "50%";
  el.style.cursor = "pointer";
  el.style.fontFamily = "system-ui, -apple-system, sans-serif";
  el.style.fontWeight = "700";
  el.style.lineHeight = "1";
  el.style.transition = "transform 0.15s ease";

  if (isCluster) {
    el.style.width = "36px";
    el.style.height = "36px";
    el.style.backgroundColor = "#F97316";
    el.style.color = "#FFFFFF";
    el.style.fontSize = "12px";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
    el.textContent = String(count);
  } else if (unavailable) {
    el.style.width = "24px";
    el.style.height = "24px";
    el.style.backgroundColor = "#D4D4D4";
    el.style.color = "#666666";
    el.style.fontSize = "10px";
    el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
    el.textContent = rating.toFixed(1);
  } else if (selected) {
    el.style.width = "36px";
    el.style.height = "36px";
    el.style.backgroundColor = "#F97316";
    el.style.color = "#FFFFFF";
    el.style.fontSize = "12px";
    el.style.border = "3px solid #FFFFFF";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
    el.textContent = rating.toFixed(1);
  } else {
    el.style.width = "28px";
    el.style.height = "28px";
    el.style.backgroundColor = "#F97316";
    el.style.color = "#FFFFFF";
    el.style.fontSize = "11px";
    el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
    el.textContent = rating.toFixed(1);
  }

  return el;
}
