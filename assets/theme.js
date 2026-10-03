(() => {
  let mode = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  try {
    const saved = localStorage.getItem("aitopia-theme");
    if (saved === "dark" || saved === "light") mode = saved;
  } catch {}
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = "only " + mode;
  document.querySelector('meta[name="color-scheme"]').content = "only " + mode;
  // Chromium can force web-content colors even when its preferred scheme is light.
  // Probe the actual Canvas color; do not mistake OS dark mode for forced recoloring.
  const probe = document.createElement("span");
  probe.style.cssText =
    "display:none;background-color:Canvas;color-scheme:only light";
  document.documentElement.append(probe);
  document.documentElement.classList.toggle(
    "browser-auto-dark",
    getComputedStyle(probe).backgroundColor !== "rgb(255, 255, 255)",
  );
  probe.remove();
})();
