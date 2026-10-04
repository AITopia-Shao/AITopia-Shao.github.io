window.AitopiaInit = () => {
  window.AitopiaCleanup?.();
  const pageLife = new AbortController();
  let observer;
  ("use strict");
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  let toastTimer;
  window.AitopiaCleanup = () => {
    pageLife.abort();
    clearTimeout(toastTimer);
    document.querySelector("#toast")?.classList.remove("visible");
    observer?.disconnect();
  };
  function notify(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制");
      return true;
    } catch {
      notify("复制失败，请手动选择文本复制");
      return false;
    }
  }
  $$("[data-copy]").forEach((el) =>
    el.addEventListener("click", () => copy(el.dataset.copy)),
  );
  $$(".article-body pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;
    const button = document.createElement("button");
    button.className = "copy-code";
    button.textContent = "复制代码";
    button.type = "button";
    button.addEventListener("click", () => copy(code.textContent));
    pre.prepend(button);
  });
  const top = $("#back-top");
  let frame = false;
  function updateScroll() {
    if (pageLife.signal.aborted) return;
    frame = false;
    top.hidden = window.scrollY < 500;
    const article = $(".article-body");
    if (article) {
      const start = article.offsetTop;
      const length = article.offsetHeight - window.innerHeight;
      const progress =
        length > 0
          ? Math.max(
              0,
              Math.min(100, ((window.scrollY - start) / length) * 100),
            )
          : window.scrollY >= start
            ? 100
            : 0;
      $("#reading-progress").style.width = progress + "%";
    }
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!frame) {
        requestAnimationFrame(updateScroll);
        frame = true;
      }
    },
    { passive: true, signal: pageLife.signal },
  );
  top.addEventListener(
    "click",
    () =>
      window.scrollTo({
        top: 0,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    { signal: pageLife.signal },
  );
  updateScroll();
  let font = 17;
  try {
    font = Math.max(
      15,
      Math.min(23, Number(localStorage.getItem("aitopia-font")) || 17),
    );
  } catch {}
  function setFont(next) {
    font = Math.max(15, Math.min(23, next));
    document.documentElement.style.setProperty(
      "--article-size",
      font / 16 + "rem",
    );
    try {
      localStorage.setItem("aitopia-font", String(font));
    } catch {}
  }
  setFont(font);
  $("#font-down")?.addEventListener("click", () => setFont(font - 1));
  $("#font-up")?.addEventListener("click", () => setFont(font + 1));
  $("#focus-mode")?.addEventListener("click", (e) => {
    const active = document.body.classList.toggle("focus-reading");
    e.currentTarget.setAttribute("aria-pressed", String(active));
    e.currentTarget.textContent = active ? "退出专注" : "专注阅读";
  });
  $("#print-article")?.addEventListener("click", () => window.print());
  if ("IntersectionObserver" in window && $(".toc")) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            $$(".toc a").forEach((a) =>
              a.classList.toggle(
                "active",
                decodeURIComponent(a.hash.slice(1)) === entry.target.id,
              ),
            );
          }
        }
      },
      { rootMargin: "-5% 0px -70% 0px" },
    );
    $$(".article-body h2,.article-body h3").forEach((el) =>
      observer.observe(el),
    );
  }
  const archive = $("#archive-tag");
  function filterArchive() {
    const value = archive.value;
    let shown = 0;
    $$(".archive-month li").forEach((li) => {
      li.hidden = !!value && !JSON.parse(li.dataset.tags).includes(value);
      if (!li.hidden) shown++;
    });
    $$(".archive-month").forEach(
      (el) =>
        (el.hidden = ![...el.querySelectorAll("li")].some((li) => !li.hidden)),
    );
    $$(".archive-year").forEach(
      (el) =>
        (el.hidden = ![...el.querySelectorAll(".archive-month")].some(
          (month) => !month.hidden,
        )),
    );
    $("#archive-empty").hidden = !value || shown > 0;
    const url = new URL(location.href);
    if (value) url.searchParams.set("tag", value);
    else url.searchParams.delete("tag");
    history.replaceState({ ...history.state }, "", url);
  }
  if (archive) {
    const tag = new URLSearchParams(location.search).get("tag");
    if (tag) {
      if (![...archive.options].some((o) => o.value === tag)) {
        const option = new Option(tag, tag);
        archive.add(option);
      }
      archive.value = tag;
      filterArchive();
    }
    archive.addEventListener("change", filterArchive);
  }
  const fullSearch = $("#full-search");
  if (fullSearch) {
    let indexPromise = null,
      serial = 0,
      timer;
    const status = $("#search-status"),
      results = $("#search-results");
    const normalize = (s) =>
      s.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
    function terms(query) {
      const set = new Set([query]);
      if (Intl.Segmenter) {
        for (const part of new Intl.Segmenter("zh-CN", {
          granularity: "word",
        }).segment(query))
          if (part.isWordLike && part.segment.trim()) set.add(part.segment);
      } else
        query
          .split(/\s+/)
          .filter(Boolean)
          .forEach((t) => set.add(t));
      return [...set];
    }
    async function runSearch() {
      if (pageLife.signal.aborted) return;
      const ticket = ++serial;
      const query = normalize(fullSearch.value).slice(0, 200);
      results.replaceChildren();
      const url = new URL(location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      history.replaceState({ ...history.state }, "", url);
      if (!query) {
        status.textContent = "";
        return;
      }
      status.textContent = "正在检索…";
      try {
        indexPromise ||= fetch("/search-index.json", {
          signal: pageLife.signal,
        })
          .then((r) => {
            if (!r.ok) throw new Error("index");
            return r.json();
          })
          .catch((e) => {
            indexPromise = null;
            throw e;
          });
        const index = await indexPromise;
        if (ticket !== serial || pageLife.signal.aborted) return;
        const keys = terms(query);
        const matches = index
          .map((p) => {
            let score = 0;
            for (const [field, weight] of [
              [p.title, 12],
              [p.tags.join(" "), 8],
              [p.category, 5],
              [p.description, 3],
              [p.text, 1],
            ]) {
              const value = normalize(field);
              for (const t of keys)
                if (value.includes(t)) score += weight * (t === query ? 3 : 1);
            }
            return { p, score };
          })
          .filter((r) => r.score > 0)
          .sort(
            (a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date),
          );
        status.textContent = index.length
          ? matches.length
            ? `${matches.length} 篇结果${matches.length > 80 ? "，显示前 80 篇" : ""}。`
            : `未找到“${fullSearch.value}”`
          : "暂无文章";
        for (const { p } of matches.slice(0, 80)) {
          const article = document.createElement("article");
          article.className = "search-result";
          const h = document.createElement("h2"),
            a = document.createElement("a");
          a.href = p.url;
          a.textContent = p.title;
          h.append(a);
          const desc = document.createElement("p");
          desc.textContent = p.description;
          const meta = document.createElement("small");
          meta.textContent = `${p.date} · ${p.category}${p.tags.length ? " · " + p.tags.join(" / ") : ""}`;
          article.append(h, desc, meta);
          results.append(article);
        }
      } catch {
        if (ticket === serial && !pageLife.signal.aborted)
          status.textContent =
            "搜索索引暂时无法加载，请检查网络后重新搜索。你也可以浏览分类与归档。";
      }
    }
    fullSearch.value = new URLSearchParams(location.search).get("q") || "";
    fullSearch.form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearTimeout(timer);
      runSearch();
    });
    fullSearch.addEventListener("input", () => {
      serial++;
      clearTimeout(timer);
      timer = setTimeout(runSearch, 180);
    });
    runSearch();
  }
  const latex = $("#latex-input");
  if (latex) {
    const groups = JSON.parse($("#formula-data").textContent);
    const formulas = groups.flatMap((g) =>
      g.items.map((f) => ({ ...f, group: g })),
    );
    let selected = formulas[0];
    const picker = $("#formula-picker"),
      panel = $("#formula-panel"),
      toggle = $("#formula-toggle");
    const tabs = $$(".formula-categories [role=tab]");
    function openPicker(open) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    }
    function activate(id) {
      for (const tab of tabs) {
        const active = tab.dataset.group === id;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      }
      for (const g of groups) $("#panel-" + g.id).hidden = g.id !== id;
    }
    toggle.addEventListener("click", () => openPicker(panel.hidden));
    for (const tab of tabs) {
      const choose = () => {
        if (!$("#formula-search").value.trim()) activate(tab.dataset.group);
      };
      tab.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") choose();
      });
      tab.addEventListener("click", () => {
        $("#formula-search").value = "";
        filterFormulas();
        choose();
      });
      tab.addEventListener("focus", choose);
      tab.addEventListener("keydown", (e) => {
        const i = tabs.indexOf(tab);
        if (
          ["ArrowDown", "ArrowUp", "Home", "End", "ArrowRight"].includes(e.key)
        )
          e.preventDefault();
        if (e.key === "ArrowDown") tabs[(i + 1) % tabs.length].focus();
        if (e.key === "ArrowUp")
          tabs[(i + tabs.length - 1) % tabs.length].focus();
        if (e.key === "Home") tabs[0].focus();
        if (e.key === "End") tabs.at(-1).focus();
        if (e.key === "ArrowRight")
          $("#panel-" + tab.dataset.group + " button:not([hidden])")?.focus();
      });
    }
    function filterFormulas() {
      const q = $("#formula-search").value.trim().toLowerCase();
      let count = 0;
      for (const g of groups) {
        let matches = 0;
        for (const f of g.items) {
          const found =
            !q ||
            (g.name + f.name + f.note + f.latex).toLowerCase().includes(q);
          $('[data-formula="' + f.id + '"]').hidden = !found;
          matches += found;
        }
        count += matches;
        $("#panel-" + g.id).hidden = q
          ? !matches
          : $("#tab-" + g.id).getAttribute("aria-selected") !== "true";
      }
      $("#formula-no-match").hidden = count > 0;
      picker.classList.toggle("is-searching", !!q);
    }
    $("#formula-search").addEventListener("input", filterFormulas);
    for (const button of $$(".formula-option")) {
      button.addEventListener("click", () => {
        selected = formulas.find((f) => f.id === button.dataset.formula);
        latex.value = selected.latex;
        $("#formula-selected").textContent = selected.name;
        $("#formula-category").textContent = selected.group.name;
        $("#formula-note").textContent = selected.note;
        $("#formula-source").href = selected.source;
        openPicker(false);
        toggle.focus();
        render();
      });
      button.addEventListener("keydown", (e) => {
        const list = $$(".formula-option").filter(
            (b) => !b.hidden && !b.parentElement.hidden,
          ),
          i = list.indexOf(button);
        if (["ArrowDown", "ArrowUp", "ArrowLeft"].includes(e.key))
          e.preventDefault();
        if (e.key === "ArrowDown") list[(i + 1) % list.length].focus();
        if (e.key === "ArrowUp")
          list[(i + list.length - 1) % list.length].focus();
        if (e.key === "ArrowLeft")
          $(".formula-categories [aria-selected=true]").focus();
      });
    }
    picker.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        openPicker(false);
        toggle.focus();
      }
    });
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!picker.contains(e.target)) openPicker(false);
      },
      { signal: pageLife.signal },
    );
    picker.addEventListener("focusout", (e) => {
      if (e.relatedTarget && !picker.contains(e.relatedTarget))
        openPicker(false);
    });
    function render() {
      const error = $("#math-error");
      if (!window.katex) {
        error.textContent = "公式引擎未能加载，请刷新重试。";
        return;
      }
      if (latex.value.length > 20000) {
        error.textContent = "公式过长，请将内容缩短到 20,000 个字符以内。";
        return;
      }
      try {
        katex.render(latex.value, $("#math-preview"), {
          displayMode: $("#display-mode").checked,
          throwOnError: true,
          trust: false,
          maxExpand: 1000,
          maxSize: 20,
          strict: "warn",
        });
        error.textContent = "";
      } catch (e) {
        $("#math-preview").replaceChildren();
        error.textContent = "公式语法有误：" + e.message;
      }
    }
    latex.value = selected.latex;
    latex.addEventListener("input", render);
    $("#display-mode").addEventListener("change", render);
    $("#reset-latex").addEventListener("click", () => {
      latex.value = selected.latex;
      $("#display-mode").checked = true;
      render();
    });
    $("#copy-latex").addEventListener("click", () => copy(latex.value));
    render();
  }
  function renderComment(target, source) {
    target.classList.add("prose");
    if (!window.markdownit) {
      target.textContent = source;
      return;
    }
    const markdown = window.markdownit({ html: false, linkify: true });
    if (window.texmath && window.katex)
      markdown.use(window.texmath, {
        engine: window.katex,
        delimiters: ["dollars", "brackets"],
        katexOptions: {
          trust: false,
          throwOnError: false,
          maxExpand: 1000,
          maxSize: 20,
        },
      });
    // Parse math before Markdown escapes or emphasis can alter its source.
    target.innerHTML = markdown.render(source);
  }
  const draft = $("#comment-draft");
  if (draft) {
    const comments = $("#comments"),
      preview = $("#comment-preview");
    function previewDraft(show) {
      draft.hidden = show;
      preview.hidden = !show;
      $("#comment-write").setAttribute("aria-pressed", String(!show));
      $("#comment-preview-toggle").setAttribute("aria-pressed", String(show));
      if (show) {
        renderComment(preview, draft.value);
        if (!draft.value.trim()) preview.textContent = "写下内容后即可预览。";
      }
    }
    $("#comment-preview-toggle").addEventListener("click", () =>
      previewDraft(true),
    );
    $("#comment-write").addEventListener("click", () => previewDraft(false));
    $$(".reply-comment").forEach((button) =>
      button.addEventListener("click", () => {
        previewDraft(false);
        draft.value = "回复 " + button.dataset.reply + "：\n\n" + draft.value;
        draft.focus();
        draft.scrollIntoView({
          block: "center",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      }),
    );
    $("#comment-submit").addEventListener("click", (e) => {
      if (comments.dataset.issue) {
        e.currentTarget.href =
          "https://github.com/" +
          comments.dataset.repo +
          "/issues/" +
          comments.dataset.issue +
          "#new_comment_field";
        if (draft.value.trim()) copy(draft.value);
      } else {
        const u = new URL(
          "https://github.com/" + comments.dataset.repo + "/issues/new",
        );
        u.searchParams.set("title", "[文章讨论] " + comments.dataset.title);
        u.searchParams.set(
          "body",
          "文章：" + comments.dataset.url + "\n\n" + draft.value,
        );
        e.currentTarget.href = u.href;
      }
    });
  }
  const loadComments = $("#load-comments");
  if (loadComments) {
    let page = 1;
    const list = $("#comment-list");
    loadComments.addEventListener("click", async () => {
      loadComments.disabled = true;
      const repo = $("#comments").dataset.repo,
        issue = $("#comments").dataset.issue;
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/issues/${issue}/comments?per_page=30&page=${page}`,
          {
            headers: { Accept: "application/vnd.github+json" },
            signal: pageLife.signal,
          },
        );
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        if (pageLife.signal.aborted) return;
        if (!data.length && page === 1) {
          const p = document.createElement("p");
          p.textContent = "还没有评论，欢迎参与讨论。";
          list.append(p);
        }
        for (const item of data) {
          const article = document.createElement("article");
          article.className = "comment";
          const header = document.createElement("header"),
            link = document.createElement("a"),
            time = document.createElement("time"),
            body = document.createElement("div");
          link.textContent = item.user?.login || "GitHub 用户";
          link.href = `https://github.com/${encodeURIComponent(item.user?.login || "")}`;
          time.textContent = new Date(item.created_at).toLocaleDateString(
            "zh-CN",
          );
          body.className = "comment-body";
          renderComment(body, item.body || "");
          header.append(link, time);
          article.append(header, body);
          list.append(article);
        }
        page++;
        const more = r.headers.get("link")?.includes('rel="next"');
        loadComments.hidden = !more;
        loadComments.textContent = "加载更多评论";
      } catch (e) {
        if (pageLife.signal.aborted) return;
        notify(
          e.message === "403"
            ? "GitHub 请求频率受限，请稍后重试或直接打开讨论。"
            : "评论暂时无法加载，请重试或直接打开 GitHub 讨论。",
        );
      } finally {
        loadComments.disabled = false;
      }
    });
  }
};
window.AitopiaInit();
