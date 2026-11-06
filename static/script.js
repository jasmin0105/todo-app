// ФРОНТЕНД: логика страницы (JavaScript)
// JavaScript общается с сервером через fetch() и рисует задачи на странице.

const API_URL = "/api/tasks";

// Названия и порядок приоритетов
const PRIORITY_NAMES = { low: "Низкий", medium: "Средний", high: "Высокий" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }; // для сортировки
const NEXT_PRIORITY = { low: "medium", medium: "high", high: "low" };

// Здесь хранится актуальный список задач и текущие настройки показа
let tasks = [];
let currentFilter = "all"; // "all" | "active" | "done"
let sortMode = "new"; // "new" | "priority" | "due" | "alpha"
let searchText = "";

// Находим элементы страницы
const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const prioritySelect = document.getElementById("priority-select");
const dateInput = document.getElementById("date-input");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const list = document.getElementById("task-list");
const emptyMsg = document.getElementById("empty-msg");
const counter = document.getElementById("counter");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const clearBtn = document.getElementById("clear-btn");
const errorMsg = document.getElementById("error-msg");
const themeBtn = document.getElementById("theme-btn");
const filterButtons = document.querySelectorAll(".filter");
const colorDots = document.querySelectorAll(".color-dot");

// ---------- РАБОТА С СЕРВЕРОМ ----------

// Универсальная функция запроса: если сервер недоступен — показываем ошибку
async function request(url, options) {
  try {
    const response = await fetch(url, options);
    errorMsg.hidden = true;
    return await response.json();
  } catch (e) {
    errorMsg.textContent = "Не удалось связаться с сервером";
    errorMsg.hidden = false;
    return null;
  }
}

// Загрузить все задачи с сервера и перерисовать страницу
async function loadTasks() {
  const data = await request(API_URL);
  if (data) {
    tasks = data;
    render();
  }
}

// Добавить задачу (POST)
async function addTask(task) {
  await request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task), // данные отправляем в формате JSON
  });
  loadTasks();
}

// Изменить задачу (PUT): { done: true } или { title: "..." } или { priority: "high" }
async function updateTask(id, changes) {
  await request(`${API_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  loadTasks();
}

// Удалить одну задачу (DELETE)
async function deleteTask(id) {
  await request(`${API_URL}/${id}`, { method: "DELETE" });
  loadTasks();
}

// Удалить все выполненные задачи (DELETE)
async function deleteCompleted() {
  await request(`${API_URL}/completed`, { method: "DELETE" });
  loadTasks();
}

// ---------- РАБОТА С ДАТАМИ ----------

// Сегодняшняя дата в формате "2026-10-22" (как хранится в базе)
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// Задача просрочена: срок раньше сегодняшнего дня и она не выполнена
function isOverdue(task) {
  return !task.done && task.due_date && task.due_date < todayString();
}

// Красивая запись срока: "до 25 окт" или "до сегодня"
function formatDue(task) {
  let text;
  if (task.due_date === todayString()) {
    text = "до сегодня";
  } else {
    const date = new Date(task.due_date + "T00:00:00");
    text =
      "до " +
      date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }
  return isOverdue(task) ? text + " (просрочено)" : text;
}

// ---------- ФИЛЬТР, ПОИСК, СОРТИРОВКА ----------

// Из всех задач выбирает те, что нужно показать, и сортирует их
function getVisibleTasks() {
  let result = tasks;

  if (currentFilter === "active") result = result.filter((t) => !t.done);
  if (currentFilter === "done") result = result.filter((t) => t.done);

  if (searchText) {
    result = result.filter((t) => t.title.toLowerCase().includes(searchText));
  }

  const sorted = [...result]; // копия, чтобы не портить исходный массив

  if (sortMode === "new") {
    sorted.sort((a, b) => b.id - a.id);
  }
  if (sortMode === "priority") {
    sorted.sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.id - a.id
    );
  }
  if (sortMode === "due") {
    sorted.sort((a, b) => {
      if (!a.due_date && !b.due_date) return b.id - a.id;
      if (!a.due_date) return 1; // задачи без срока — в конец
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }
  if (sortMode === "alpha") {
    sorted.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }

  return sorted;
}

// ---------- ОТРИСОВКА ----------

// Главная функция: берёт массив tasks и рисует всё на странице
function render() {
  // 1. Рисуем список
  const visible = getVisibleTasks();
  list.innerHTML = "";
  visible.forEach((task) => list.appendChild(createTaskElement(task)));
  emptyMsg.hidden = visible.length > 0; // «Здесь пока пусто»

  // 2. Считаем статистику
  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.done).length;
  const overdueCount = tasks.filter(isOverdue).length;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-active").textContent = total - doneCount;
  document.getElementById("stat-done").textContent = doneCount;
  document.getElementById("stat-overdue").textContent = overdueCount;

  progressBar.style.width = percent + "%";
  if (total > 0 && doneCount === total) {
    progressText.textContent = "Все задачи выполнены!";
  } else {
    progressText.textContent = `Выполнено ${doneCount} из ${total} (${percent}%)`;
  }
  counter.textContent = `Осталось задач: ${total - doneCount}`;
  clearBtn.hidden = doneCount === 0; // кнопка видна, только если есть выполненные
}

// Создаёт одну строку списка (<li>) для задачи
function createTaskElement(task) {
  const priority = task.priority || "medium";

  const li = document.createElement("li");
  li.classList.add("prio-" + priority); // цветная полоска слева
  if (task.done) li.classList.add("done");

  // чекбокс «выполнено»
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  checkbox.addEventListener("change", () =>
    updateTask(task.id, { done: checkbox.checked })
  );

  // центральная часть: текст задачи + строка с приоритетом и сроком
  const body = document.createElement("div");
  body.className = "task-body";

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";

  // бейдж приоритета: по клику меняется на следующий
  const badge = document.createElement("button");
  badge.className = "badge badge-" + priority;
  badge.textContent = PRIORITY_NAMES[priority];
  badge.title = "Нажми, чтобы сменить приоритет";
  badge.addEventListener("click", () =>
    updateTask(task.id, { priority: NEXT_PRIORITY[priority] })
  );
  meta.appendChild(badge);

  // срок выполнения (если указан)
  if (task.due_date) {
    const due = document.createElement("span");
    due.className = "due";
    if (isOverdue(task)) due.classList.add("overdue");
    due.textContent = formatDue(task);
    meta.appendChild(due);
  }

  body.append(title, meta);

  // кнопка «редактировать»
  const editBtn = document.createElement("button");
  editBtn.textContent = "✎";
  editBtn.title = "Редактировать";
  editBtn.className = "action-btn";
  editBtn.addEventListener("click", () => startEdit(body, title, task));

  // кнопка «удалить»
  const delBtn = document.createElement("button");
  delBtn.textContent = "✕";
  delBtn.title = "Удалить";
  delBtn.className = "action-btn delete";
  delBtn.addEventListener("click", () => deleteTask(task.id));

  li.append(checkbox, body, editBtn, delBtn);
  return li;
}

// Режим редактирования: вместо текста показываем поле ввода
function startEdit(body, title, task) {
  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.value = task.title;
  editInput.className = "edit-input";

  body.replaceChild(editInput, title);
  editInput.focus();

  editInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const newTitle = editInput.value.trim();
      if (newTitle && newTitle !== task.title) {
        updateTask(task.id, { title: newTitle }); // сохраняем
      } else {
        render(); // ничего не изменилось
      }
    }
    if (event.key === "Escape") render(); // отмена
  });
}

// ---------- СОБЫТИЯ ----------

// Отправка формы — добавление задачи
form.addEventListener("submit", (event) => {
  event.preventDefault(); // чтобы страница не перезагружалась
  const title = input.value.trim();
  if (!title) return;

  addTask({
    title: title,
    priority: prioritySelect.value,
    due_date: dateInput.value, // пустая строка, если срок не выбран
  });

  input.value = "";
  dateInput.value = "";
});

// Поиск: срабатывает при каждом нажатии клавиши
searchInput.addEventListener("input", () => {
  searchText = searchInput.value.trim().toLowerCase();
  render();
});

// Сортировка
sortSelect.addEventListener("change", () => {
  sortMode = sortSelect.value;
  render();
});

// Кнопки фильтров
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

// Кнопка «Удалить выполненные»
clearBtn.addEventListener("click", deleteCompleted);

// Тёмная / светлая тема (выбор запоминается в браузере)
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
});

// Выбор цветовой темы
function setColor(color) {
  document.body.dataset.color = color;
  localStorage.setItem("color", color);
  colorDots.forEach((dot) =>
    dot.classList.toggle("active", dot.dataset.color === color)
  );
}

colorDots.forEach((dot) => {
  dot.addEventListener("click", () => setColor(dot.dataset.color));
});

// ---------- СТАРТ ----------

// Применяем сохранённые настройки внешнего вида
if (localStorage.getItem("theme") === "dark")
  document.body.classList.add("dark");
setColor(localStorage.getItem("color") || "ocean");

// Показываем сегодняшнюю дату
document.getElementById("date").textContent = new Date().toLocaleDateString(
  "ru-RU",
  {
    weekday: "long",
    day: "numeric",
    month: "long",
  }
);

// При открытии страницы сразу загружаем задачи
loadTasks();
