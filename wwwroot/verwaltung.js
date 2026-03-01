const roleSelect = document.getElementById("roleSelect");
const usersTable = document.getElementById("usersTable");
const flagsTable = document.getElementById("flagsTable");
const userForm = document.getElementById("userForm");
const flagForm = document.getElementById("flagForm");

let roles = [];
let users = [];
let flags = [];

async function apiRequest(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  return response.json();
}

async function loadRoles() {
  roles = await apiRequest("/api/roles");
  roleSelect.innerHTML = "";
  roles.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role.roleId;
    opt.textContent = `${role.roleName} (${role.roleId})`;
    roleSelect.appendChild(opt);
  });
}

async function loadUsers() {
  users = await apiRequest("/api/admin/users");
  usersTable.innerHTML = "";
  users.forEach(user => {
    const row = document.createElement("div");
    row.className = "event-item";
    row.innerHTML = `<div><strong>${user.userId}</strong> - ${user.firstname || ""} ${user.lastname || ""} · Rolle: ${user.roleName} · Verband: ${user.verband}</div>`;
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Löschen";
    del.onclick = async () => {
      await apiRequest(`/api/admin/users/${user.userId}`, { method: "DELETE" });
      await loadUsers();
    };
    row.appendChild(del);
    usersTable.appendChild(row);
  });
}

async function loadFlags() {
  flags = await apiRequest("/api/flags");
  flagsTable.innerHTML = "";
  flags.forEach(flag => {
    const row = document.createElement("div");
    row.className = "event-item";
    row.innerHTML = `<div><strong>${flag.id}</strong> - ${flag.name} · ${flag.color} · Verband: ${flag.verband ? "Ja" : "Nein"} · Bereich: ${flag.bereich ? "Ja" : "Nein"}</div>`;
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Löschen";
    del.onclick = async () => {
      await apiRequest(`/api/flags/${flag.id}`, { method: "DELETE" });
      await loadFlags();
    };
    row.appendChild(del);
    flagsTable.appendChild(row);
  });
}

userForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await apiRequest("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      firstname: document.getElementById("firstname").value,
      lastname: document.getElementById("lastname").value,
      verband: document.getElementById("verband").value,
      roleId: Number(roleSelect.value)
    })
  });
  userForm.reset();
  await loadUsers();
});

flagForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await apiRequest("/api/flags", {
    method: "POST",
    body: JSON.stringify({
      id: 0,
      name: document.getElementById("flagName").value,
      color: document.getElementById("flagColor").value,
      verband: document.getElementById("flagVerband").checked,
      bereich: document.getElementById("flagBereich").checked,
      description: document.getElementById("flagDescription").value || null
    })
  });
  flagForm.reset();
  await loadFlags();
});

(async function init() {
  await loadRoles();
  await loadUsers();
  await loadFlags();
})();
