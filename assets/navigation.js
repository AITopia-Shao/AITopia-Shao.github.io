(() => {
  "use strict";
  const theme = document.querySelector("#theme-toggle");
  const menu = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#main-nav");
  const media = matchMedia("(prefers-color-scheme: dark)");
  function themeLabel() {
    const dark = document.documentElement.dataset.theme === "dark";
    theme.querySelector(".theme-glyph").textContent = dark ? "☾" : "☼";
    theme.querySelector(".theme-name").textContent = dark
      ? "仰望星空"
      : "林间曙光";
    theme.setAttribute(
      "aria-label",
      dark ? "切换至林间曙光" : "切换至仰望星空",
    );
    theme.title = theme.getAttribute("aria-label");
    document.querySelector("meta[name=theme-color]").content = dark
      ? "#030405"
      : "#eee9bd";
  }
  let themeRevision = 0;
  function setTheme(mode) {
    if (mode !== "light" && mode !== "dark") return;
    const revision = ++themeRevision;
    document.documentElement.classList.add("theme-switching");
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = "only " + mode;
    document.querySelector('meta[name="color-scheme"]').content =
      "only " + mode;
    themeLabel();
    // Wait for the actual palette transition, including a reversed transition.
    // Never cut inherited colors short with a fixed cleanup timeout.
    const transitions = document.documentElement
      .getAnimations({ subtree: true })
      .filter((animation) =>
        ["--theme-progress", "opacity", "filter", "transform"].includes(
          animation.transitionProperty,
        ),
      );
    Promise.allSettled(transitions.map((animation) => animation.finished)).then(
      () => {
        if (revision === themeRevision)
          document.documentElement.classList.remove("theme-switching");
      },
    );
  }
  theme.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("aitopia-theme", next);
    } catch {}
    setTheme(next);
  });
  media.addEventListener("change", (e) => {
    try {
      if (localStorage.getItem("aitopia-theme")) return;
    } catch {}
    setTheme(e.matches ? "dark" : "light");
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "aitopia-theme")
      setTheme(e.newValue || (media.matches ? "dark" : "light"));
  });
  themeLabel();
  function closeMenu() {
    nav.classList.remove("open");
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-label", "打开菜单");
  }
  menu.addEventListener("click", () => {
    const opened = nav.classList.toggle("open");
    menu.setAttribute("aria-expanded", String(opened));
    menu.setAttribute("aria-label", opened ? "关闭菜单" : "打开菜单");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
    if (
      e.key === "/" &&
      !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) &&
      !e.target.isContentEditable &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      const input = document.querySelector("input[type=search]");
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }
  });
  // Keep the document canvas, page header and sidebar alive across route changes.
  history.scrollRestoration = "manual";
  history.replaceState({ ...history.state, scroll: [scrollX, scrollY] }, "");
  let pending,
    generation = 0,
    scrollTimer;
  let renderedPage = location.pathname + location.search;
  function cancelPendingNavigation() {
    if (!pending) return;
    generation++;
    pending.abort();
    pending = null;
    document.querySelector("#main").removeAttribute("aria-busy");
  }
  function restorePosition(url, position = null) {
    if (position) {
      window.scrollTo({
        left: position[0],
        top: position[1],
        behavior: "instant",
      });
      return;
    }
    let id = url.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {}
    const anchor = id && document.getElementById(id);
    if (anchor) anchor.scrollIntoView({ behavior: "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }
  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (!pending)
          history.replaceState(
            { ...history.state, scroll: [scrollX, scrollY] },
            "",
          );
      }, 120);
    },
    { passive: true },
  );
  const loaded = new Map(
    [...document.querySelectorAll("script[src]")].map((s) => [
      new URL(s.src).pathname,
      Promise.resolve(),
    ]),
  );
  async function scriptsFor(doc) {
    for (const source of doc.querySelectorAll("script[src]")) {
      const url = new URL(source.getAttribute("src"), location.origin);
      if (
        url.origin !== location.origin ||
        !url.pathname.startsWith("/assets/vendor/")
      )
        continue;
      if (!loaded.has(url.pathname)) {
        const promise = new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = url.href;
          script.onload = resolve;
          script.onerror = () => {
            script.remove();
            loaded.delete(url.pathname);
            reject(new Error("script"));
          };
          document.head.append(script);
        });
        loaded.set(url.pathname, promise);
      }
      await loaded.get(url.pathname);
    }
  }
  const metadata =
    'meta[name=description],meta[name=robots],meta[property^="og:"],link[rel=canonical],script[type="application/ld+json"]';
  function currentLinks() {
    for (const link of document.querySelectorAll(
      "#main-nav a,.category-nav a",
    )) {
      if (new URL(link.href).pathname === location.pathname)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }
  async function navigate(target, { pop = false, scroll = null } = {}) {
    const ticket = ++generation;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    closeMenu();
    document.querySelector("#main").setAttribute("aria-busy", "true");
    try {
      let url = new URL(target, location.href),
        doc;
      for (let redirects = 0; redirects < 3; redirects++) {
        const response = await fetch(url.pathname + url.search, {
          signal: controller.signal,
          headers: { Accept: "text/html" },
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("text/html")
        )
          throw new Error("navigation");
        doc = new DOMParser().parseFromString(
          await response.text(),
          "text/html",
        );
        const refresh = doc
          .querySelector("meta[http-equiv=refresh]")
          ?.content.match(/url=(.+)$/i)?.[1];
        if (!refresh) break;
        const redirect = new URL(refresh, url);
        if (redirect.origin !== location.origin) throw new Error("redirect");
        url = redirect;
      }
      const incoming = doc.querySelector("#main");
      if (!incoming) throw new Error("document");
      if (
        doc.querySelector('meta[name="aitopia-build"]')?.content !==
        document.querySelector('meta[name="aitopia-build"]')?.content
      ) {
        location.assign(url.href);
        return;
      }
      await scriptsFor(doc);
      if (ticket !== generation || controller.signal.aborted) return;
      if (!pop) {
        history.replaceState(
          { ...history.state, scroll: [scrollX, scrollY] },
          "",
        );
        history.pushState({ scroll: [0, 0] }, "", url);
      }
      window.AitopiaCleanup?.();
      document.querySelector("#main").replaceWith(incoming);
      renderedPage = url.pathname + url.search;
      document.title = doc.title;
      document.querySelectorAll(metadata).forEach((el) => el.remove());
      doc
        .querySelectorAll(metadata)
        .forEach((el) => document.head.append(el.cloneNode(true)));
      document.body.className = doc.body.className;
      document.querySelector("#reading-progress").style.width = "0";
      currentLinks();
      window.AitopiaInit?.();
      incoming.focus({ preventScroll: true });
      restorePosition(url, scroll);
      document.dispatchEvent(
        new CustomEvent("aitopia:navigated", { detail: { url: url.href } }),
      );
    } catch {
      if (ticket !== generation) return;
      if (pop) {
        location.reload();
        return;
      }
      const toast = document.querySelector("#toast");
      toast.textContent = "页面暂时无法加载，请重试。";
      toast.classList.add("visible");
      setTimeout(() => toast.classList.remove("visible"), 3000);
    } finally {
      clearTimeout(timeout);
      if (ticket === generation) {
        pending = null;
        document.querySelector("#main").removeAttribute("aria-busy");
      }
    }
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (
      !a ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      a.hasAttribute("download") ||
      a.target === "_blank" ||
      a.hasAttribute("data-no-nav")
    )
      return;
    const url = new URL(a.href, location.href);
    if (
      url.origin !== location.origin ||
      !/^https?:$/.test(url.protocol) ||
      !/\/$|\.html$/.test(url.pathname)
    )
      return;
    if (
      url.pathname === location.pathname &&
      url.search === location.search &&
      url.hash
    ) {
      cancelPendingNavigation();
      closeMenu();
      history.replaceState(
        { ...history.state, scroll: [scrollX, scrollY] },
        "",
      );
      return;
    }
    e.preventDefault();
    if (url.href === location.href) {
      cancelPendingNavigation();
      closeMenu();
      return;
    }
    navigate(url);
  });
  document.addEventListener("submit", (e) => {
    if (
      !e.target.matches(".search-form") ||
      e.target.querySelector("#full-search")
    )
      return;
    e.preventDefault();
    const url = new URL("/search/", location.origin);
    url.searchParams.set("q", new FormData(e.target).get("q") || "");
    navigate(url);
  });
  window.addEventListener("popstate", (e) => {
    // Native fragment links also emit popstate. Keep the existing DOM and editor
    // state for these entries instead of fetching the page and resetting scroll.
    if (location.pathname + location.search === renderedPage) {
      cancelPendingNavigation();
      closeMenu();
      restorePosition(new URL(location.href), e.state?.scroll ?? null);
      return;
    }
    navigate(location.href, { pop: true, scroll: e.state?.scroll ?? null });
  });
})();
