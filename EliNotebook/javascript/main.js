"use strict";

// EliNotebook 3.6
// 資料只會儲存在目前瀏覽器的 localStorage，不會上傳至伺服器。
// 舊版高／中／低優先程度會自動轉換成「緊急性 × 重要性」，原有備忘錄不會被刪除。

window.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "eliNotebook.tasks.v2";
  const LEGACY_STORAGE_KEY = "eliNotebook.tasks.v1";
  const CATEGORIES_KEY = "eliNotebook.noteCategories.v1";
  const THEME_KEY = "eliNotebook.theme.v1";
  const PRIVACY_DELAY_KEY = "eliNotebook.privacyDelay.v1";
  // 只記錄使用者已閱讀本機儲存說明，不包含備忘錄內容或個人資料。
  const LOCAL_NOTICE_KEY = "eliNotebook.localNotice.v1";
  // 顏色使用固定色票代碼，避免任意色碼造成文字看不清楚或破壞深色模式。
  const CATEGORY_COLORS = ["red", "orange", "gold", "green", "blue", "purple", "pink", "gray"];
  const CATEGORY_COLOR_LABELS = { red: "紅色", orange: "橘色", gold: "金色", green: "綠色", blue: "藍色", purple: "紫色", pink: "粉色", gray: "灰色" };
  const DEFAULT_CATEGORIES = [
    { name: "工作", color: "blue", custom: false },
    { name: "客戶聯繫", color: "orange", custom: false },
    { name: "理賠", color: "red", custom: false },
    { name: "保單整理", color: "gold", custom: false },
    { name: "個人", color: "green", custom: false },
    { name: "其他", color: "gray", custom: false }
  ];
  const QUADRANT_LABELS = {
    q1: "緊急且重要", q2: "重要但不緊急", q3: "緊急但不重要", q4: "不緊急且不重要"
  };
  const QUADRANT_ORDER = { q1: 0, q2: 1, q3: 2, q4: 3 };

  const elements = {
    navItems: [...document.querySelectorAll(".nav-item")],
    views: [...document.querySelectorAll("[data-view-panel]")],
    goViewButtons: [...document.querySelectorAll("[data-go-view]")],
    quickAddForm: document.querySelector("#quick-add-form"),
    input: document.querySelector("#new-task-input"),
    category: document.querySelector("#new-task-category"),
    urgency: document.querySelector("#new-task-urgency"),
    importance: document.querySelector("#new-task-importance"),
    characterCount: document.querySelector("#character-count"),
    inputSafety: document.querySelector("#input-safety"),
    recentTasks: document.querySelector("#recent-tasks"),
    allTasks: document.querySelector("#all-tasks"),
    completedTasks: document.querySelector("#completed-tasks"),
    matrixStatusFilter: document.querySelector("#matrix-status-filter"),
    quadrantLists: {
      q1: document.querySelector("#quadrant-q1-list"), q2: document.querySelector("#quadrant-q2-list"),
      q3: document.querySelector("#quadrant-q3-list"), q4: document.querySelector("#quadrant-q4-list")
    },
    quadrantCounts: {
      q1: document.querySelector("#quadrant-q1-count"), q2: document.querySelector("#quadrant-q2-count"),
      q3: document.querySelector("#quadrant-q3-count"), q4: document.querySelector("#quadrant-q4-count")
    },
    search: document.querySelector("#search-input"),
    categoryFilter: document.querySelector("#category-filter"),
    statusFilter: document.querySelector("#status-filter"),
    sortFilter: document.querySelector("#sort-filter"),
    resultCount: document.querySelector("#result-count"),
    totalCount: document.querySelector("#total-count"),
    pendingCount: document.querySelector("#pending-count"),
    completedCount: document.querySelector("#completed-count"),
    exportJson: document.querySelector("#export-json"),
    exportCsv: document.querySelector("#export-csv"),
    exportText: document.querySelector("#export-text"),
    exportMarkdown: document.querySelector("#export-markdown"),
    exportHtml: document.querySelector("#export-html"),
    printNotes: document.querySelector("#print-notes"),
    importFile: document.querySelector("#import-file"),
    themeToggle: document.querySelector("#theme-toggle"),
    privacyToggle: document.querySelector("#privacy-toggle"),
    privacyScreen: document.querySelector("#privacy-screen"),
    privacyReveal: document.querySelector("#privacy-reveal"),
    privacyDelay: document.querySelector("#privacy-delay"),
    securityStatus: document.querySelector("#security-status"),
    noteCategoryForm: document.querySelector("#note-category-form"),
    noteCategoryName: document.querySelector("#note-category-name"),
    noteCategoryColor: document.querySelector("#note-category-color"),
    noteCategoryList: document.querySelector("#note-category-list"),
    settingsThemeToggle: document.querySelector("#settings-theme-toggle"),
    clearAll: document.querySelector("#clear-all"),
    storageStatus: document.querySelector("#storage-status"),
    clock: document.querySelector("#clock"),
    localStorageDialog: document.querySelector("#local-storage-dialog"),
    localStorageAccept: document.querySelector("#local-storage-accept"),
    toast: document.querySelector("#undo-toast"),
    undoDelete: document.querySelector("#undo-delete"),
    liveStatus: document.querySelector("#live-status")
  };

  let tasks = loadTasks();
  let categories = loadCategories();
  let deletedSnapshot = null;
  let undoTimer = null;
  let privacyTimer = null;

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // 偵測常見敏感資料格式。這不是完整個資辨識工具，但可阻擋最常見的誤輸入。
  function detectSensitiveData(content) {
    const findings = [];
    if (/\b[A-Z][12]\d{8}\b/i.test(content)) findings.push("疑似身分證字號");
    if (/(?:^|\D)09\d{8}(?:\D|$)/.test(content.replace(/[\s-]/g, ""))) findings.push("疑似手機號碼");
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content)) findings.push("Email");
    if (/(身分證|保單號碼|病歷|診斷書|信用卡|銀行帳號|帳戶密碼|登入密碼)/.test(content)) findings.push("敏感資料關鍵字");

    const numberGroups = content.match(/(?:\d[ -]*?){13,19}/g) || [];
    if (numberGroups.some((value) => passesLuhn(value.replace(/\D/g, "")))) findings.push("疑似信用卡號碼");
    return [...new Set(findings)];
  }

  function passesLuhn(value) {
    if (!/^\d{13,19}$/.test(value)) return false;
    let sum = 0;
    let doubleDigit = false;
    for (let index = value.length - 1; index >= 0; index -= 1) {
      let digit = Number(value[index]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }

  function guardSensitiveContent(content, focusElement) {
    const findings = detectSensitiveData(content);
    if (!findings.length) return true;
    alert(`為保護個資，這則備忘錄未儲存。\n\n偵測到：${findings.join("、")}\n\n請刪除可識別個人的資料，改用不具識別性的工作提醒。`);
    if (focusElement) focusElement.focus();
    return false;
  }

  function cleanCategoryName(value) {
    return typeof value === "string" ? value.trim().slice(0, 30) : "";
  }

  function normalizeCategory(value, index = 0) {
    const name = cleanCategoryName(typeof value === "string" ? value : value?.name);
    if (!name) return null;
    const color = CATEGORY_COLORS.includes(value?.color) ? value.color : CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    const defaultCategory = DEFAULT_CATEGORIES.find((item) => item.name === name);
    return { name, color, custom: defaultCategory ? false : value?.custom !== false };
  }

  function mergeCategories(...groups) {
    const result = [];
    groups.flat().forEach((value, index) => {
      const hasExplicitColor = Boolean(value && typeof value === "object" && CATEGORY_COLORS.includes(value.color));
      const category = normalizeCategory(value, index);
      if (!category) return;
      const existing = result.find((item) => item.name === category.name);
      if (existing) {
        if (hasExplicitColor) existing.color = category.color;
        existing.custom = existing.custom && category.custom;
      } else result.push(category);
    });
    return result;
  }

  function loadCategories() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORIES_KEY) || "[]");
      const taskCategories = tasks.map((task) => ({ name: task.category, custom: !DEFAULT_CATEGORIES.some((item) => item.name === task.category) }));
      return mergeCategories(DEFAULT_CATEGORIES, Array.isArray(saved) ? saved : [], taskCategories);
    } catch (error) {
      console.warn("無法讀取備忘錄分類：", error);
      return mergeCategories(DEFAULT_CATEGORIES, tasks.map((task) => task.category));
    }
  }

  function saveCategories() {
    try {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
      return true;
    } catch (error) {
      console.error("無法儲存備忘錄分類：", error);
      alert("分類無法儲存。請確認瀏覽器沒有封鎖網站資料，並避免使用無痕模式。");
      return false;
    }
  }

  function quadrantKey(task) {
    if (task.important && task.urgent) return "q1";
    if (task.important) return "q2";
    if (task.urgent) return "q3";
    return "q4";
  }

  function categoryDefinition(name) {
    return categories.find((item) => item.name === name) || { name: "其他", color: "gray", custom: false };
  }

  // 把外部匯入或舊版資料整理成系統可接受的格式，避免錯誤欄位破壞畫面。
  function normalizeTask(value) {
    if (typeof value === "string") {
      const content = value.trim().slice(0, 500);
      if (!content) return null;
      const timestamp = nowIso();
      return { id: createId(), content, category: "其他", urgent: false, important: true, completed: false, createdAt: timestamp, updatedAt: timestamp };
    }

    if (!value || typeof value !== "object") return null;
    const content = typeof value.content === "string" ? value.content.trim().slice(0, 500) : "";
    if (!content) return null;
    const createdAt = Number.isNaN(Date.parse(value.createdAt)) ? nowIso() : value.createdAt;
    const updatedAt = Number.isNaN(Date.parse(value.updatedAt)) ? createdAt : value.updatedAt;
    // 舊版 high 對應「緊急且重要」、medium 對應「重要但不緊急」、low 對應「不緊急且不重要」。
    const legacyPriority = ["high", "medium", "low"].includes(value.priority) ? value.priority : "medium";
    return {
      id: typeof value.id === "string" && value.id ? value.id : createId(),
      content,
      category: typeof value.category === "string" && value.category.trim() ? value.category.trim().slice(0, 30) : "其他",
      urgent: typeof value.urgent === "boolean" ? value.urgent : legacyPriority === "high",
      important: typeof value.important === "boolean" ? value.important : legacyPriority !== "low",
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
    const categoryInfo = categoryDefinition(task.category);
    const card = document.createElement("article");
    card.className = `task-card category-border-${categoryInfo.color}${task.completed ? " completed" : ""}`;
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
      createMeta(task.category, `category-badge category-color-${categoryInfo.color}`),
      createMeta(task.completed ? "已完成" : "待完成", task.completed ? "status-completed" : "status-pending"),
      createMeta(task.urgent ? "緊急" : "不緊急", task.urgent ? "flag-urgent" : "flag-normal"),
      createMeta(task.important ? "重要" : "不重要", task.important ? "flag-important" : "flag-normal"),
      createMeta(QUADRANT_LABELS[quadrantKey(task)], `quadrant-badge quadrant-${quadrantKey(task)}`),
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
    const urgency = document.createElement("select");
    urgency.setAttribute("aria-label", "編輯緊急性");
    [["true", "緊急"], ["false", "不緊急"]].forEach(([value, label]) => urgency.add(new Option(label, value, false, (value === "true") === task.urgent)));
    const importance = document.createElement("select");
    importance.setAttribute("aria-label", "編輯重要性");
    [["true", "重要"], ["false", "不重要"]].forEach(([value, label]) => importance.add(new Option(label, value, false, (value === "true") === task.important)));
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-button";
    save.textContent = "儲存修改";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary-button";
    cancel.textContent = "取消";
    options.append(category, urgency, importance, save, cancel);
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
      if (!guardSensitiveContent(newContent, textarea)) return;
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index < 0) return;
      const previous = { ...tasks[index] };
      tasks[index] = { ...tasks[index], content: newContent, category: category.value, urgent: urgency.value === "true", important: importance.value === "true", updatedAt: nowIso() };
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
    return categories.map((item) => item.name);
  }

  function updateCategoryControls() {
    const previousFilter = elements.categoryFilter.value || "all";
    const previousEntry = elements.category.value;
    elements.categoryFilter.replaceChildren(new Option("全部分類", "all"));
    elements.category.replaceChildren();
    categories.forEach((category) => {
      elements.categoryFilter.add(new Option(`● ${category.name}`, category.name));
      elements.category.add(new Option(category.name, category.name));
    });
    elements.categoryFilter.value = [...elements.categoryFilter.options].some((option) => option.value === previousFilter) ? previousFilter : "all";
    elements.category.value = [...elements.category.options].some((option) => option.value === previousEntry) ? previousEntry : (categories[0]?.name || "其他");
  }

  function renderCategoryManager() {
    elements.noteCategoryList.replaceChildren();
    categories.forEach((category) => {
      const row = document.createElement("div");
      row.className = "note-category-row";
      const identity = document.createElement("div");
      const dot = document.createElement("span");
      dot.className = `category-dot category-color-${category.color}`;
      dot.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong");
      name.textContent = category.name;
      const usage = document.createElement("small");
      const usageCount = tasks.filter((task) => task.category === category.name).length;
      usage.textContent = `${category.custom ? "自訂" : "預設"}分類｜${usageCount} 則`;
      identity.append(dot, name, usage);

      const controls = document.createElement("div");
      controls.className = "note-category-controls";
      const color = document.createElement("select");
      color.setAttribute("aria-label", `設定「${category.name}」分類顏色`);
      CATEGORY_COLORS.forEach((value) => color.add(new Option(CATEGORY_COLOR_LABELS[value], value, false, value === category.color)));
      color.addEventListener("change", () => updateCategoryColor(category.name, color.value));
      controls.append(color);
      if (category.custom) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "category-delete-button";
        remove.textContent = "刪除";
        remove.addEventListener("click", () => deleteCategory(category.name));
        controls.append(remove);
      }
      row.append(identity, controls);
      elements.noteCategoryList.append(row);
    });
  }

  function addCategory(event) {
    event.preventDefault();
    const name = cleanCategoryName(elements.noteCategoryName.value);
    if (!name) return;
    if (categories.some((item) => item.name.toLocaleLowerCase("zh-TW") === name.toLocaleLowerCase("zh-TW"))) {
      alert("這個分類名稱已存在。");
      elements.noteCategoryName.focus();
      return;
    }
    const category = { name, color: CATEGORY_COLORS.includes(elements.noteCategoryColor.value) ? elements.noteCategoryColor.value : "gray", custom: true };
    categories.push(category);
    if (!saveCategories()) { categories.pop(); return; }
    elements.noteCategoryForm.reset();
    updateCategoryControls();
    renderCategoryManager();
    elements.category.value = name;
    announce(`已新增「${name}」分類`);
  }

  function updateCategoryColor(name, color) {
    const index = categories.findIndex((item) => item.name === name);
    if (index < 0 || !CATEGORY_COLORS.includes(color)) return;
    const previous = categories[index].color;
    categories[index] = { ...categories[index], color };
    if (!saveCategories()) { categories[index].color = previous; return; }
    renderAll();
    announce(`「${name}」分類顏色已更新`);
  }

  function deleteCategory(name) {
    const index = categories.findIndex((item) => item.name === name && item.custom);
    if (index < 0) return;
    const usage = tasks.filter((task) => task.category === name).length;
    if (usage) { alert(`「${name}」仍有${usage}則備忘錄使用，請先修改那些備忘錄的分類。`); return; }
    if (!window.confirm(`確定刪除「${name}」分類？`)) return;
    const removed = categories.splice(index, 1)[0];
    if (!saveCategories()) { categories.splice(index, 0, removed); return; }
    renderAll();
    announce(`已刪除「${name}」分類`);
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
      if (mode === "matrix") return QUADRANT_ORDER[quadrantKey(a)] - QUADRANT_ORDER[quadrantKey(b)] || Date.parse(b.createdAt) - Date.parse(a.createdAt);
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

  function createMatrixTask(task) {
    const categoryInfo = categoryDefinition(task.category);
    const item = document.createElement("article");
    item.className = `matrix-task category-border-${categoryInfo.color}${task.completed ? " completed" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", task.completed ? `將「${task.content}」改為待完成` : `將「${task.content}」標示為已完成`);
    checkbox.addEventListener("change", () => toggleCompleted(task.id, checkbox.checked));
    const body = document.createElement("div");
    const content = document.createElement("p");
    content.textContent = task.content;
    const meta = document.createElement("div");
    meta.className = "matrix-task-meta";
    meta.append(
      createMeta(task.category, `category-badge category-color-${categoryInfo.color}`),
      createMeta(task.completed ? "已完成" : "待完成", task.completed ? "status-completed" : "status-pending")
    );
    body.append(content, meta);
    item.append(checkbox, body);
    return item;
  }

  function renderMatrix() {
    const status = elements.matrixStatusFilter.value;
    const source = tasks.filter((task) => status === "all" || (status === "completed" ? task.completed : !task.completed));
    Object.keys(elements.quadrantLists).forEach((key) => {
      const list = source.filter((task) => quadrantKey(task) === key).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      elements.quadrantCounts[key].textContent = String(list.length);
      elements.quadrantLists[key].replaceChildren();
      if (!list.length) {
        const empty = document.createElement("p");
        empty.className = "quadrant-empty";
        empty.textContent = status === "completed" ? "這個象限沒有已完成事項" : "這個象限目前沒有事項";
        elements.quadrantLists[key].append(empty);
      } else list.forEach((task) => elements.quadrantLists[key].append(createMatrixTask(task)));
    });
  }

  function renderAll() {
    updateCategoryControls();
    renderCategoryManager();
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
    renderMatrix();
    const riskyCount = tasks.filter((task) => detectSensitiveData(task.content).length > 0).length;
    elements.securityStatus.textContent = riskyCount
      ? `現有資料中有 ${riskyCount} 則可能包含敏感內容，建議立即刪除或改寫。`
      : "目前沒有偵測到常見身分證、電話、Email、信用卡或敏感關鍵字。";
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
    if (!guardSensitiveContent(content, elements.input)) return;
    const timestamp = nowIso();
    const task = {
      id: createId(), content, category: elements.category.value,
      urgent: elements.urgency.value === "true", important: elements.importance.value === "true",
      completed: false, createdAt: timestamp, updatedAt: timestamp
    };
    tasks.unshift(task);
    if (!saveTasks()) {
      tasks.shift();
      return;
    }
    elements.quickAddForm.reset();
    elements.urgency.value = "false";
    elements.importance.value = "true";
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
    if (!window.confirm("匯出的 JSON 會包含全部備忘錄內容。請勿放進公開 GitHub、雲端共享資料夾或傳給他人。\n\n確定要下載嗎？")) return;
    const backup = { app: "EliNotebook", version: 3, exportedAt: nowIso(), categories, tasks };
    downloadFile(`EliNotebook-backup-${fileDate()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    announce("完整 JSON 備份已下載");
  }

  function exportText() {
    if (!window.confirm("匯出的文字檔可以直接閱讀。請勿放進公開 GitHub 或分享給他人。\n\n確定要下載嗎？")) return;
    const lines = tasks.map((task, index) => [
      `${index + 1}. [${task.completed ? "已完成" : "待完成"}] ${task.content}`,
      `   分類：${task.category}｜${task.urgent ? "緊急" : "不緊急"}｜${task.important ? "重要" : "不重要"}｜${QUADRANT_LABELS[quadrantKey(task)]}｜建立：${formatDate(task.createdAt)}`
    ].join("\n"));
    const content = `EliNotebook 備忘錄\n匯出時間：${formatDate(nowIso())}\n總計：${tasks.length} 則\n\n${lines.join("\n\n")}`;
    downloadFile(`EliNotebook-${fileDate()}.txt`, content, "text/plain;charset=utf-8");
    announce("閱讀用文字檔已下載");
  }

  function confirmExport(format) {
    return window.confirm(`匯出的 ${format} 檔會包含備忘錄內容，且不會加密。請勿放進公開 GitHub 或分享給他人。\n\n確定要下載嗎？`);
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    if (!confirmExport("CSV")) return;
    const header = ["內容", "分類", "分類顏色", "緊急性", "重要性", "四象限", "狀態", "建立時間", "修改時間"];
    const rows = tasks.map((task) => [task.content, task.category, categoryDefinition(task.category).color, task.urgent ? "緊急" : "不緊急", task.important ? "重要" : "不重要", QUADRANT_LABELS[quadrantKey(task)], task.completed ? "已完成" : "待完成", task.createdAt, task.updatedAt]);
    const content = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadFile(`EliNotebook-${fileDate()}.csv`, content, "text/csv;charset=utf-8");
    announce("CSV 已下載");
  }

  function exportMarkdown() {
    if (!confirmExport("Markdown")) return;
    const rows = tasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.content.replace(/\n/g, " ")}  \n  分類：${task.category}｜${task.urgent ? "緊急" : "不緊急"}｜${task.important ? "重要" : "不重要"}｜${QUADRANT_LABELS[quadrantKey(task)]}｜建立：${formatDate(task.createdAt)}`);
    const content = `# EliNotebook 備忘錄\n\n匯出時間：${formatDate(nowIso())}\n\n${rows.join("\n\n")}`;
    downloadFile(`EliNotebook-${fileDate()}.md`, content, "text/markdown;charset=utf-8");
    announce("Markdown 已下載");
  }

  function escapeHtml(value) {
    const node = document.createElement("div");
    node.textContent = String(value);
    return node.innerHTML;
  }

  function exportHtml() {
    if (!confirmExport("HTML")) return;
    const items = tasks.map((task) => `<li><strong>${task.completed ? "已完成" : "待完成"}</strong><p>${escapeHtml(task.content).replace(/\n/g, "<br>")}</p><small>${escapeHtml(task.category)}｜${task.urgent ? "緊急" : "不緊急"}｜${task.important ? "重要" : "不重要"}｜${escapeHtml(QUADRANT_LABELS[quadrantKey(task)])}｜${escapeHtml(formatDate(task.createdAt))}</small></li>`).join("");
    const content = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EliNotebook 匯出</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;font-family:sans-serif;line-height:1.7}li{margin:0 0 24px}p{margin:4px 0}small{color:#666}</style></head><body><h1>EliNotebook 備忘錄</h1><p>匯出時間：${escapeHtml(formatDate(nowIso()))}</p><ol>${items}</ol></body></html>`;
    downloadFile(`EliNotebook-${fileDate()}.html`, content, "text/html;charset=utf-8");
    announce("HTML 已下載");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted && character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell);
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        cell = "";
      } else cell += character;
    }
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
    if (!rows.length) return [];
    const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim());
    const contentIndex = headers.findIndex((value) => /^(內容|content|note|備忘錄)$/i.test(value));
    const start = contentIndex >= 0 ? 1 : 0;
    return rows.slice(start).map((values) => {
      const content = values[contentIndex >= 0 ? contentIndex : 0]?.trim();
      if (!content) return null;
      const get = (pattern) => {
        const index = headers.findIndex((header) => pattern.test(header));
        return index >= 0 ? values[index] : "";
      };
      const timestamp = nowIso();
      const urgencyValue = get(/^(緊急性|urgent|urgency)$/i);
      const importanceValue = get(/^(重要性|important|importance)$/i);
      return normalizeTask({
        content,
        category: get(/^(分類|category)$/i) || "其他",
        priority: get(/^(優先程度|priority)$/i) || "medium",
        urgent: urgencyValue ? /^(緊急|true|1|yes)$/i.test(urgencyValue) : undefined,
        important: importanceValue ? /^(重要|true|1|yes)$/i.test(importanceValue) : undefined,
        completed: /^(已完成|true|1|yes|x)$/i.test(get(/^(狀態|status|completed)$/i)),
        createdAt: get(/^(建立時間|createdAt|created)$/i) || timestamp,
        updatedAt: get(/^(修改時間|updatedAt|updated)$/i) || timestamp
      });
    }).filter(Boolean);
  }

  function parseTextNotes(text, extension) {
    if (extension === "html" || extension === "htm") {
      const documentCopy = new DOMParser().parseFromString(text, "text/html");
      documentCopy.querySelectorAll("script,style,noscript,template").forEach((node) => node.remove());
      const selected = [...documentCopy.querySelectorAll("li")].map((node) => node.querySelector("p")?.textContent || node.textContent);
      text = selected.length ? selected.join("\n") : documentCopy.body.textContent || "";
    }
    let lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (extension === "md" || extension === "markdown") {
      lines = lines.filter((line) => /^[-*+]\s+(?:\[[ xX]\]\s*)?/.test(line)).map((line) => line.replace(/^[-*+]\s+(?:\[[ xX]\]\s*)?/, ""));
    } else {
      const numbered = lines.filter((line) => /^\d+\.\s+(?:\[(?:已完成|待完成)\]\s*)?/.test(line));
      lines = numbered.length ? numbered.map((line) => line.replace(/^\d+\.\s+(?:\[(?:已完成|待完成)\]\s*)?/, "")) : lines;
    }
    return lines.slice(0, 2000).map((content) => normalizeTask(content)).filter(Boolean);
  }

  function importFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("檔案超過 5MB，為保護瀏覽器效能，已停止匯入。");
      event.target.value = "";
      return;
    }
    const extension = file.name.split(".").pop().toLowerCase();
    const allowed = ["json", "csv", "txt", "md", "markdown", "html", "htm"];
    if (!allowed.includes(extension)) {
      alert("不支援這個檔案格式。請選擇 JSON、CSV、TXT、Markdown 或 HTML。");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const text = String(reader.result).replace(/^\uFEFF/, "");
        let normalized = [];
        let importedCategories = [];
        if (extension === "json") {
          const parsed = JSON.parse(text);
          const source = Array.isArray(parsed) ? parsed : parsed.tasks;
          if (!Array.isArray(source)) throw new Error("JSON 內沒有可匯入的陣列");
          normalized = source.map(normalizeTask).filter(Boolean).slice(0, 2000);
          importedCategories = Array.isArray(parsed?.categories) ? parsed.categories.map(normalizeCategory).filter(Boolean) : [];
        } else if (extension === "csv") normalized = parseCsv(text).slice(0, 2000);
        else normalized = parseTextNotes(text, extension);
        const rejected = normalized.filter((task) => detectSensitiveData(task.content).length > 0);
        const imported = normalized.filter((task) => detectSensitiveData(task.content).length === 0);
        if (rejected.length) alert(`為保護個資，已略過 ${rejected.length} 則疑似包含敏感資料的內容。`);
        if (!imported.length) {
          alert("檔案中沒有可安全匯入的備忘錄。");
          return;
        }
        const shouldReplace = window.confirm(`讀取到 ${imported.length} 則備忘錄。\n\n按「確定」取代目前資料；按「取消」則合併資料。`);
        const previous = [...tasks];
        const previousCategories = categories.map((category) => ({ ...category }));
        if (shouldReplace) tasks = imported;
        else {
          const ids = new Set(tasks.map((task) => task.id));
          tasks = [...tasks, ...imported.filter((task) => !ids.has(task.id))];
        }
        const categoriesFromTasks = tasks.map((task) => ({ name: task.category, custom: !DEFAULT_CATEGORIES.some((item) => item.name === task.category) }));
        categories = shouldReplace
          ? mergeCategories(DEFAULT_CATEGORIES, importedCategories, categoriesFromTasks)
          : mergeCategories(categories, importedCategories, categoriesFromTasks);
        if (!saveTasks() || !saveCategories()) {
          tasks = previous;
          categories = previousCategories;
          saveTasks();
          saveCategories();
          return;
        }
        renderAll();
        announce(`${extension.toUpperCase()} 匯入完成`);
      } catch (error) {
        console.error("匯入失敗：", error);
        alert("無法匯入。請確認檔案格式與內容正確，且沒有損壞。");
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

  function getPrivacyDelay() {
    try {
      const saved = localStorage.getItem(PRIVACY_DELAY_KEY);
      return ["0", "60000", "120000", "300000"].includes(saved) ? saved : "120000";
    } catch (error) {
      console.warn("無法讀取隱私設定：", error);
      return "120000";
    }
  }

  function showPrivacyScreen() {
    elements.privacyScreen.hidden = false;
    document.body.style.overflow = "hidden";
    if (!document.hidden) elements.privacyReveal.focus();
    window.clearTimeout(privacyTimer);
  }

  function hidePrivacyScreen() {
    elements.privacyScreen.hidden = true;
    document.body.style.overflow = "";
    schedulePrivacyScreen();
    announce("備忘錄內容已顯示");
  }

  function schedulePrivacyScreen() {
    window.clearTimeout(privacyTimer);
    const delay = Number(elements.privacyDelay.value);
    if (delay > 0 && elements.privacyScreen.hidden) {
      privacyTimer = window.setTimeout(showPrivacyScreen, delay);
    }
  }

  function savePrivacyDelay() {
    try {
      localStorage.setItem(PRIVACY_DELAY_KEY, elements.privacyDelay.value);
    } catch (error) {
      console.warn("無法保存隱私設定：", error);
    }
    schedulePrivacyScreen();
  }

  function updateStorageStatus() {
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
    const size = bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
    elements.storageStatus.textContent = `目前保存 ${tasks.length} 則備忘錄，約使用 ${size}。資料僅存在這個瀏覽器。`;
  }

  function updateClock() {
    // 不指定固定時區，讓瀏覽器依使用者手機或電腦設定，自動顯示所在地時間。
    elements.clock.textContent = new Intl.DateTimeFormat("zh-TW", {
      year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date());
    elements.clock.dateTime = new Date().toISOString();
    elements.clock.title = `依目前裝置偵測的時區：${Intl.DateTimeFormat().resolvedOptions().timeZone || "裝置當地時區"}`;
  }

  // 第一次使用時顯示本機儲存提醒，避免使用者誤以為資料會跨裝置同步。
  function showLocalStorageNotice() {
    let hasAccepted = false;
    try {
      hasAccepted = localStorage.getItem(LOCAL_NOTICE_KEY) === "accepted";
    } catch (error) {
      console.warn("無法讀取本機儲存提示狀態：", error);
    }
    if (!hasAccepted) {
      elements.localStorageDialog.hidden = false;
      elements.localStorageAccept.focus();
    }
  }

  function acceptLocalStorageNotice() {
    try {
      localStorage.setItem(LOCAL_NOTICE_KEY, "accepted");
    } catch (error) {
      console.warn("無法保存本機儲存提示狀態：", error);
    }
    elements.localStorageDialog.hidden = true;
    elements.input.focus();
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
  elements.noteCategoryForm.addEventListener("submit", addCategory);
  elements.input.addEventListener("input", () => {
    elements.characterCount.textContent = `${elements.input.value.length} / 500`;
    const findings = detectSensitiveData(elements.input.value);
    elements.inputSafety.classList.toggle("warning", findings.length > 0);
    elements.inputSafety.textContent = findings.length
      ? `偵測到：${findings.join("、")}。這則內容將無法儲存。`
      : "系統會阻擋身分證、電話、Email、信用卡及明顯的病歷／保單識別資料。";
  });
  [elements.search, elements.categoryFilter, elements.statusFilter, elements.sortFilter].forEach((control) => control.addEventListener("input", renderAll));
  elements.matrixStatusFilter.addEventListener("change", renderMatrix);
  elements.undoDelete.addEventListener("click", undoDelete);
  elements.exportJson.addEventListener("click", exportJson);
  elements.exportCsv.addEventListener("click", exportCsv);
  elements.exportText.addEventListener("click", exportText);
  elements.exportMarkdown.addEventListener("click", exportMarkdown);
  elements.exportHtml.addEventListener("click", exportHtml);
  elements.printNotes.addEventListener("click", () => window.print());
  elements.importFile.addEventListener("change", importFile);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.privacyToggle.addEventListener("click", showPrivacyScreen);
  elements.privacyReveal.addEventListener("click", hidePrivacyScreen);
  elements.privacyDelay.addEventListener("change", savePrivacyDelay);
  elements.settingsThemeToggle.addEventListener("click", toggleTheme);
  elements.clearAll.addEventListener("click", clearAllTasks);
  elements.localStorageAccept.addEventListener("click", acceptLocalStorageNotice);

  // 其他分頁若修改同一份 localStorage，目前分頁會即時重新載入資料。
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      tasks = loadTasks();
      categories = loadCategories();
      renderAll();
      announce("備忘錄已從其他分頁更新");
    }
    if (event.key === CATEGORIES_KEY) {
      categories = loadCategories();
      renderAll();
      announce("備忘錄分類已從其他分頁更新");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) showPrivacyScreen();
  });
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, schedulePrivacyScreen, { passive: true });
  });

  applyTheme(preferredTheme());
  elements.privacyDelay.value = getPrivacyDelay();
  schedulePrivacyScreen();
  updateClock();
  // 每秒重新顯示當地時間；只讀取裝置時鐘，不會連接外部時間服務。
  window.setInterval(updateClock, 1000);
  // 啟動時保存一次正規化結果，讓舊版優先程度與舊分類安全升級成3.3格式。
  saveTasks();
  saveCategories();
  renderAll();
  showLocalStorageNotice();
});
