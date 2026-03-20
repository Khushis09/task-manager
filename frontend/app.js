// Base URL for the Spring Boot API
const API_BASE = "http://localhost:8080/api/tasks";

// Currently active filter: "all" | "PENDING" | "COMPLETED"
let currentFilter = "all";

// ── Fetch helpers ──────────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    // Try to parse error body for validation messages
    const err = await res.json().catch(() => ({}));
    throw { status: res.status, body: err };
  }
  // 204 No Content has no body
  if (res.status === 204) return null;
  return res.json();
}

// ── API calls ──────────────────────────────────────────────────────────────

const getTasks   = ()           => apiFetch(API_BASE);
const createTask = (data)       => apiFetch(API_BASE, { method: "POST", body: JSON.stringify(data) });
const updateTask = (id, data)   => apiFetch(`${API_BASE}/${id}`, { method: "PUT", body: JSON.stringify(data) });
const deleteTask = (id)         => apiFetch(`${API_BASE}/${id}`, { method: "DELETE" });
const toggleTask = (id)         => apiFetch(`${API_BASE}/${id}/toggle`, { method: "PATCH" });

// ── Render ─────────────────────────────────────────────────────────────────

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderTasks(tasks) {
  const list = document.getElementById("task-list");
  const summary = document.getElementById("summary");

  // Update summary count
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "COMPLETED").length;
  summary.textContent = `${total} task${total !== 1 ? "s" : ""} — ${completed} completed`;

  // Apply filter
  const filtered = currentFilter === "all"
    ? tasks
    : tasks.filter(t => t.status === currentFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-state">No tasks here. ${currentFilter === "all" ? "Add one above." : ""}</p>`;
    return;
  }

  list.innerHTML = filtered.map(task => `
    <div class="task-card ${task.status === "COMPLETED" ? "completed" : ""}" data-id="${task.id}">
      <div class="task-view">
        <div class="task-header">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="badge ${task.status === "COMPLETED" ? "badge-completed" : "badge-pending"}">
            ${task.status === "COMPLETED" ? "Completed" : "Pending"}
          </span>
        </div>
        ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
        <p class="task-meta">Created ${formatDate(task.createdAt)}</p>
        <div class="task-actions">
          <button class="btn btn-toggle" onclick="handleToggle(${task.id})">
            ${task.status === "COMPLETED" ? "Mark Pending" : "Mark Complete"}
          </button>
          <button class="btn btn-edit" onclick="showEditForm(${task.id})">Edit</button>
          <button class="btn btn-delete" onclick="handleDelete(${task.id})">Delete</button>
        </div>
      </div>

      <!-- Inline edit form (hidden by default) -->
      <div class="edit-form" id="edit-form-${task.id}" style="display:none;">
        <input type="text" id="edit-title-${task.id}" value="${escapeHtml(task.title)}" placeholder="Title (required)" />
        <span class="field-error" id="edit-error-${task.id}"></span>
        <input type="text" id="edit-desc-${task.id}" value="${escapeHtml(task.description || "")}" placeholder="Description (optional)" />
        <div class="edit-actions">
          <button class="btn btn-save" onclick="handleUpdate(${task.id})">Save</button>
          <button class="btn btn-cancel" onclick="hideEditForm(${task.id})">Cancel</button>
        </div>
      </div>
    </div>
  `).join("");
}

// Prevent XSS when inserting user content into HTML
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Load & refresh ─────────────────────────────────────────────────────────

async function loadTasks() {
  try {
    const tasks = await getTasks();
    renderTasks(tasks);
  } catch (e) {
    document.getElementById("task-list").innerHTML =
      `<p class="empty-state">Could not connect to the API. Is the backend running?</p>`;
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

// Create task on form submit
document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titleInput = document.getElementById("title-input");
  const descInput  = document.getElementById("desc-input");
  const titleError = document.getElementById("title-error");

  const title = titleInput.value.trim();

  // Client-side validation
  if (!title) {
    titleInput.classList.add("input-error");
    titleError.textContent = "Title is required.";
    titleInput.focus();
    return;
  }

  titleInput.classList.remove("input-error");
  titleError.textContent = "";

  try {
    await createTask({ title, description: descInput.value.trim() || null });
    titleInput.value = "";
    descInput.value  = "";
    await loadTasks();
  } catch (err) {
    // Handle 400 from backend
    if (err.status === 400 && err.body?.title) {
      titleInput.classList.add("input-error");
      titleError.textContent = err.body.title;
    }
  }
});

// Clear validation state on input
document.getElementById("title-input").addEventListener("input", () => {
  document.getElementById("title-input").classList.remove("input-error");
  document.getElementById("title-error").textContent = "";
});

// Toggle task status
async function handleToggle(id) {
  await toggleTask(id);
  await loadTasks();
}

// Delete task
async function handleDelete(id) {
  await deleteTask(id);
  await loadTasks();
}

// Show inline edit form, hide the view section
function showEditForm(id) {
  const card = document.querySelector(`[data-id="${id}"]`);
  card.querySelector(".task-view").style.display = "none";
  document.getElementById(`edit-form-${id}`).style.display = "flex";
  document.getElementById(`edit-title-${id}`).focus();
}

// Hide inline edit form, restore view
function hideEditForm(id) {
  const card = document.querySelector(`[data-id="${id}"]`);
  card.querySelector(".task-view").style.display = "";
  document.getElementById(`edit-form-${id}`).style.display = "none";
}

// Save inline edit
async function handleUpdate(id) {
  const titleInput = document.getElementById(`edit-title-${id}`);
  const descInput  = document.getElementById(`edit-desc-${id}`);
  const errorEl    = document.getElementById(`edit-error-${id}`);

  const title = titleInput.value.trim();

  if (!title) {
    titleInput.classList.add("input-error");
    errorEl.textContent = "Title is required.";
    titleInput.focus();
    return;
  }

  titleInput.classList.remove("input-error");
  errorEl.textContent = "";

  try {
    await updateTask(id, { title, description: descInput.value.trim() || null });
    await loadTasks();
  } catch (err) {
    if (err.status === 400 && err.body?.title) {
      titleInput.classList.add("input-error");
      errorEl.textContent = err.body.title;
    }
  }
}

// ── Filter buttons ─────────────────────────────────────────────────────────

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    loadTasks();
  });
});

// ── Init ───────────────────────────────────────────────────────────────────
loadTasks();
