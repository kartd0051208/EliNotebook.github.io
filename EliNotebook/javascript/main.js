"use strict";

// EliNotebook 2.0
// 資料只會儲存在目前瀏覽器的 localStorage，不會上傳至伺服器。
// v2 採用物件格式，並會自動把舊版 v1 的純文字陣列轉換成新版資料。

window.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "eliNotebook.tasks.v2";
  const LEGACY_STORAGE_KEY = "eliNotebook.tasks.v1";
  const THEME_KEY = "eliNotebook.theme.v1";
  const DEFAULT_CATEGORIES = ["工作", "客戶聯繫", "理賠", "保單整理", "個人", "其他"];
  const PRIORITY_LABELS = { high: "高優先", medium: "中優先", low: "低優先" };
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  const elements = {
    navItems: [...document.querySelectorAll(".nav-item")],
    views: [...document.querySelectorAll("[data-view-panel]")],
    goViewButtons: [...document.querySelectorAll("[data-go-view]")],
    quickAddForm: document.querySelector("#quick-add-form"),
    input: document.querySelector("#new-task-input"),
    category: document.querySelector("#new-task-category"),
    priority: document.querySelector("#new-task-priority"),
    characterCount: document.querySelector("#character-count"),
    recentTasks: document.querySelector("#recent-tasks"),
    allTasks: document.querySelector("#all-tasks"),
    completedTasks: document.querySelector("#completed-tasks"),
    search: document.querySelector("#search-input"),
    categoryFilter: document.querySelector("#category-filter"),
    statusFilter: document.querySelector("#status-filter"),
    sortFilter: document.querySelector("#sort-filter"),
    resultCount: document.querySelector("#result-count"),
    totalCount: document.querySelector("#total-count"),
    pendingCount: document.querySelector("#pending-count"),
    completedCount: document.querySelector("#completed-count"),
    exportJson: document.querySelector("#export-json"),
    exportText: document.querySelector("#export-text"),
    importJson: document.querySelector("#import-json"),
    themeToggle: document.querySelector("#theme-toggle"),
    settingsThemeToggle: document.querySelector("#settings-theme-toggle"),
    clearAll: document.querySelector("#clear-all"),
    storageStatus: document.querySelector("#storage-status"),
    clock: document.querySelector("#clock"),
    toast: document.querySelector("#undo-toast"),
    undoDelete: document.querySelector("#undo-delete"),
    liveStatus: document.querySelector("#live-status")
  };

  let tasks = loadTasks();
  let deletedSnapshot = null;
  let undoTimer = null;

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // 把外部匯入或舊版資料整理成系統可接受的格式，避免錯誤欄位破壞畫面。
  function normalizeTask(value) {
    if (typeof value === "string") {
      const content = value.trim().slice(0, 500);
      if (!content) return null;
      const timestamp = nowIso();
      return { id: createId(), content, category: "其他", priority: "medium", completed: false, createdAt: timestamp, updatedAt: timestamp };
    }

    if (!value || typeof value !== "object") return null;
    const content = typeof value.content === "string" ? value.content.trim().slice(0, 500) : "";
    if (!content) return null;
    const createdAt = Number.isNaN(Date.parse(value.createdAt)) ? nowIso() : value.createdAt;
    const updatedAt = Number.isNaN(Date.parse(value.updatedAt)) ? createdAt : value.updatedAt;
    return {
      id: typeof value.id === "string" && value.id ? value.id : createId(),
      content,
      category: typeof value.category === "string" && value.category.trim() ? value.category.trim().slice(0, 30) : "其他",
      priority: ["high", "medium", "low"].includes(value.priority) ? value.priority : "medium",
      completed: value.completed === true,
      createdAt,
      updatedAt
    };
  }

  function loadTasks() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== null) {
        const parsed = JSON.parse(current);
        return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean) : [];
      }

      // 第一次開啟 2.0 時，自動讀取舊版 v1，轉換後仍保留原本的備忘錄。
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
      const migrated = Array.isArray(legacy) ? legacy.map(normalizeTask).filter(Boolean) : [];
      if (migrated.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (error) {
      console.error("無法讀取備忘錄：", error);
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      updateStorageStatus();
      return true;
    } catch (error) {
      console.error("無法儲存備忘錄：", error);
      alert("備忘錄無法儲存。請確認瀏覽器沒有封鎖網站資料，並避免使用無痕模式。");
      return false;
    }
  }

  function announce(message) {
    elements.liveStatus.textContent = "";
    window.setTimeout(() => { elements.liveStatus.textContent = message; }, 30);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日期不明";
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(date);
  }

  function createMeta(text, className = "") {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) span.className = className;
    return span;
  }

  function emptyState(title, description) {
    const box = document.createElement("div");
    box.className = "empty-state";
    const strong = document.createElement("strong");
    const text = document.createElement("span");
    strong.textContent = title;
    text.textContent = description;
    box.append(strong, text);
    return box;
  }

  function createTaskCard(task) {
    const card = document.createElement("article");
    card.className = `task-card${task.completed ? " completed" : ""}`;
    card.dataset.taskId = task.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", task.completed ? "設為待完成" : "標示為已完成");

    const content = document.createElement("div");
    content.className = "task-content";
    const paragraph = document.createElement("p");
    paragraph.textContent = task.content;
    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.append(
      createMeta(task.category),
      createMeta(PRIORITY_LABELS[task.priority], `priority-${task.priority}`),
      createMeta(`建立 ${formatDate(task.createdAt)}`)
    );
    if (task.updatedAt !== task.createdAt) meta.append(createMeta(`修改 ${formatDate(task.updatedAt)}`));
    content.append(paragraph, meta);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "編輯";
    edit.setAttribute("aria-label", `編輯：${task.content}`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.textContent = "刪除";
    remove.setAttribute("aria-label", `刪除：${task.content}`);
    actions.append(edit, remove);
    card.append(checkbox, content, actions);

    checkbox.addEventListener("change", () => toggleCompleted(task.id, checkbox.checked));
    remove.addEventListener("click", () => deleteTask(task.id));
    edit.addEventListener("click", () => openEditor(card, task));
    return card;
  }

  function openEditor(card, task) {
    if (card.querySelector(".edit-panel")) return;
    const panel = document.createElement("div");
    panel.className = "edit-panel";
    const textarea = document.createElement("textarea");
    textarea.maxLength = 500;
    textarea.value = task.content;
    textarea.setAttribute("aria-label", "編輯備忘錄內容");

    const options = document.createElement("div");
    options.className = "edit-options";
    const category = document.createElement("select");
    category.setAttribute("aria-label", "編輯分類");
    getCategories().forEach((name) => category.add(new Option(name, name, false, name === task.category)));
    const priority = document.createElement("select");
    priority.setAttribute("aria-label", "編輯優先程度");
    [["high", "高"], ["medium", "中"], ["low", "低"]].forEach(([value, label]) => priority.add(new Option(label, value, false, value === task.priority)));
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-button";
    save.textContent = "儲存修改";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary-button";
    cancel.textContent = "取消";
    options.append(category, priority, save, cancel);
    panel.append(textarea, options);
    card.append(panel);
    textarea.focus();

    cancel.addEventListener("click", () => panel.remove());
    save.addEventListener("click", () => {
      const newContent = textarea.value.trim();
      if (!newContent) {
        alert("備忘錄內容不能是空白。");
        textarea.focus();
        return;
      }
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index < 0) return;
      const previous = { ...tasks[index] };
      tasks[index] = { ...tasks[index], content: newContent, category: category.value, priority: priority.value, updatedAt: nowIso() };
      if (!saveTasks()) {
        tasks[index] = previous;
        return;
      }
      renderAll();
      announce("備忘錄修改完成");
    });
  }

  function toggleCompleted(id, completed) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    const previous = { ...tasks[index] };
    tasks[index] = { ...tasks[index], completed, updatedAt: nowIso() };
    if (!saveTasks()) {
      tasks[index] = previous;
      renderAll();
      return;
    }
    renderAll();
    announce(completed ? "已標示為完成" : "已重新設為待完成");
  }

  function deleteTask(id) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    const removed = tasks[index];
    tasks.splice(index, 1);
    if (!saveTasks()) {
      tasks.splice(index, 0, removed);
      return;
    }
    deletedSnapshot = { task: removed, index };
    showUndoToast();
    renderAll();
    announce("備忘錄已刪除，可按復原還原");
  }

  function showUndoToast() {
    window.clearTimeout(undoTimer);
    elements.toast.hidden = false;
    undoTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
      deletedSnapshot = null;
    }, 7000);
  }

  function undoDelete() {
    if (!deletedSnapshot) return;
    const { task, index } = deletedSnapshot;
    tasks.splice(Math.min(index, tasks.length), 0, task);
    if (!saveTasks()) {
      tasks = tasks.filter((item) => item.id !== task.id);
      return;
    }
    deletedSnapshot = null;
    elements.toast.hidden = true;
    window.clearTimeout(undoTimer);
    renderAll();
    announce("已復原刪除的備忘錄");
  }

  function getCategories() {
    return [...new Set([...DEFAULT_CATEGORIES, ...tasks.map((task) => task.category)])];
  }

  function updateCategoryFilter() {
    const previous = elements.categoryFilter.value || "all";
    elements.categoryFilter.replaceChildren(new Option("全部分類", "all"));
    getCategories().forEach((name) => elements.categoryFilter.add(new Option(name, name)));
    elements.categoryFilter.value = [...elements.categoryFilter.options].some((option) => option.value === previous) ? previous : "all";
  }

  function filteredTasks() {
    const query = elements.search.value.trim().toLocaleLowerCase("zh-TW");
    const category = elements.categoryFilter.value;
    const status = elements.statusFilter.value;
    const sorted = tasks.filter((task) => {
      const matchesQuery = !query || `${task.content} ${task.category}`.toLocaleLowerCase("zh-TW").includes(query);
      const matchesCategory = category === "all" || task.category === category;
      const matchesStatus = status === "all" || (status === "completed" ? task.completed : !task.completed);
      return matchesQuery && matchesCategory && matchesStatus;
    });

    const mode = elements.sortFilter.value;
    sorted.sort((a, b) => {
      if (mode === "oldest") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (mode === "updated") return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (mode === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return sorted;
  }

  function renderList(container, list, emptyTitle, emptyDescription) {
    container.replaceChildren();
    if (!list.length) {
      container.append(emptyState(emptyTitle, emptyDescription));
      return;
    }
    list.forEach((task) => container.append(createTaskCard(task)));
  }

  function renderAll() {
    updateCategoryFilter();
    elements.totalCount.textContent = String(tasks.length);
    elements.pendingCount.textContent = String(tasks.filter((task) => !task.completed).length);
    elements.completedCount.textContent = String(tasks.filter((task) => task.completed).length);

    const recent = [...tasks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
    renderList(elements.recentTasks, recent, "目前沒有備忘錄", "從上方輸入第一則內容開始使用。" );

    const visibleTasks = filteredTasks();
    elements.resultCount.textContent = `共 ${visibleTasks.length} 則`;
    renderList(elements.allTasks, visibleTasks, "找不到符合條件的內容", "請調整搜尋文字或篩選條件。" );

    const completed = tasks.filter((task) => task.completed).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    renderList(elements.completedTasks, completed, "還沒有已完成事項", "完成備忘錄後，紀錄會出現在這裡。" );
    updateStorageStatus();
  }

  function changeView(name) {
    elements.views.forEach((view) => view.classList.toggle("active", view.dataset.viewPanel === name));
    elements.navItems.forEach((button) => {
      const active = button.dataset.view === name;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addTask(event) {
    event.preventDefault();
    const content = elements.input.value.trim();
    if (!content) {
      alert("請先輸入備忘錄內容。");
      elements.input.focus();
      return;
    }
    const timestamp = nowIso();
    const task = {
      id: createId(), content, category: elements.category.value,
      priority: elements.priority.value, completed: false, createdAt: timestamp, updatedAt: timestamp
    };
    tasks.unshift(task);
    if (!saveTasks()) {
      tasks.shift();
      return;
    }
    elements.quickAddForm.reset();
    elements.characterCount.textContent = "0 / 500";
    renderAll();
    announce("備忘錄新增完成");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function fileDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function exportJson() {
    const backup = { app: "EliNotebook", version: 2, exportedAt: nowIso(), tasks };
    downloadFile(`EliNotebook-backup-${fileDate()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    announce("完整 JSON 備份已下載");
  }

  function exportText() {
    const lines = tasks.map((task, index) => [
      `${index + 1}. [${task.completed ? "已完成" : "待完成"}] ${task.content}`,
      `   分類：${task.category}｜優先：${PRIORITY_LABELS[task.priority]}｜建立：${formatDate(task.createdAt)}`
    ].join("\n"));
    const content = `EliNotebook 備忘錄\n匯出時間：${formatDate(nowIso())}\n總計：${tasks.length} 則\n\n${lines.join("\n\n")}`;
    downloadFile(`EliNotebook-${fileDate()}.txt`, content, "text/plain;charset=utf-8");
    announce("閱讀用文字檔已下載");
  }

  function importJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("檔案超過 5MB，請確認選擇的是 EliNotebook JSON 備份。");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const source = Array.isArray(parsed) ? parsed : parsed.tasks;
        if (!Array.isArray(source)) throw new Error("備份內沒有 tasks 陣列");
        const imported = source.map(normalizeTask).filter(Boolean);
        if (!imported.length && source.length) throw new Error("沒有可使用的備忘錄資料");
        const shouldReplace = window.confirm(`讀取到 ${imported.length} 則備忘錄。\n\n按「確定」取代目前資料；按「取消」則合併資料。`);
        const previous = [...tasks];
        if (shouldReplace) tasks = imported;
        else {
          const ids = new Set(tasks.map((task) => task.id));
          tasks = [...tasks, ...imported.filter((task) => !ids.has(task.id))];
        }
        if (!saveTasks()) {
          tasks = previous;
          return;
        }
        renderAll();
        announce("備份匯入完成");
      } catch (error) {
        console.error("匯入失敗：", error);
        alert("無法匯入。請確認這是 EliNotebook 匯出的 JSON 備份檔。");
      } finally {
        event.target.value = "";
      }
    });
    reader.readAsText(file, "utf-8");
  }

  function preferredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (error) {
      console.warn("無法讀取外觀設定：", error);
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn("無法保存外觀設定：", error);
    }
    const dark = theme === "dark";
    elements.themeToggle.setAttribute("aria-label", dark ? "切換淺色模式" : "切換深色模式");
    document.querySelector('meta[name="theme-color"]').content = dark ? "#1d211e" : "#37413a";
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }

  function updateStorageStatus() {
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
    const size = bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
    elements.storageStatus.textContent = `目前保存 ${tasks.length} 則備忘錄，約使用 ${size}。資料僅存在這個瀏覽器。`;
  }

  function updateClock() {
    elements.clock.textContent = new Intl.DateTimeFormat("zh-TW", {
      month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date());
  }

  function clearAllTasks() {
    if (!tasks.length) {
      alert("目前沒有可清除的備忘錄。");
      return;
    }
    const confirmed = window.confirm("確定清除全部備忘錄？\n這個動作無法復原，建議先匯出 JSON 備份。");
    if (!confirmed) return;
    const previous = [...tasks];
    tasks = [];
    if (!saveTasks()) {
      tasks = previous;
      return;
    }
    renderAll();
    announce("全部備忘錄已清除");
  }

  elements.navItems.forEach((button) => button.addEventListener("click", () => changeView(button.dataset.view)));
  elements.goViewButtons.forEach((button) => button.addEventListener("click", () => changeView(button.dataset.goView)));
  elements.quickAddForm.addEventListener("submit", addTask);
  elements.input.addEventListener("input", () => { elements.characterCount.textContent = `${elements.input.value.length} / 500`; });
  [elements.search, elements.categoryFilter, elements.statusFilter, elements.sortFilter].forEach((control) => control.addEventListener("input", renderAll));
  elements.undoDelete.addEventListener("click", undoDelete);
  elements.exportJson.addEventListener("click", exportJson);
  elements.exportText.addEventListener("click", exportText);
  elements.importJson.addEventListener("change", importJson);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.settingsThemeToggle.addEventListener("click", toggleTheme);
  elements.clearAll.addEventListener("click", clearAllTasks);

  // 其他分頁若修改同一份 localStorage，目前分頁會即時重新載入資料。
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      tasks = loadTasks();
      renderAll();
      announce("備忘錄已從其他分頁更新");
    }
  });

  applyTheme(preferredTheme());
  updateClock();
  window.setInterval(updateClock, 30000);
  renderAll();
});
