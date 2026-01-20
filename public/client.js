const socket = io();

const hostBtn = document.getElementById("hostBtn");
const roomInput = document.getElementById("roomInput");
const usernameInput = document.getElementById("usernameInput");
const joinBtn = document.getElementById("joinBtn");
const messages = document.getElementById("messages");

roomInput.addEventListener("input", (e) => {
  let value = e.target.value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .substring(0, 4);
  e.target.value = value;
});

let currentRoom = null;
let isHost = false;
let playerCount = null;
let edition = null;
let editionData = null;
let selectedRoles = [];
let assignedRoles = {};
let nightOrder = [];
let currentNightIndex = 0;
let revealed = false;
let rolesRevealed = false;
let currentUsernames = new Set();

function saveHostState() {
  if (isHost && currentRoom) {
    const state = {
      room: currentRoom,
      playerCount,
      edition,
      selectedRoles,
      assignedRoles,
      nightOrder,
      revealed,
    };
    localStorage.setItem(`botc-host-${currentRoom}`, JSON.stringify(state));
  }
}

function loadHostState(room) {
  const stateStr = localStorage.getItem(`botc-host-${room}`);
  if (stateStr) {
    const state = JSON.parse(stateStr);
    playerCount = state.playerCount;
    edition = state.edition;
    selectedRoles = state.selectedRoles;
    assignedRoles = state.assignedRoles;
    nightOrder = state.nightOrder;
    revealed = state.revealed || false;
    return true;
  }
  return false;
}

window.addEventListener("load", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get("type");
  const room = urlParams.get("room");
  const username = urlParams.get("username");
  if (type && room) {
    socket.emit("rejoin", { type, room, username });
  }
});

hostBtn.addEventListener("click", () => {
  localStorage.clear();
  Swal.fire({
    title: "Number of players",
    input: "select",
    inputOptions: {
      5: "5",
      6: "6",
      7: "7",
      8: "8",
      9: "9",
      10: "10",
      11: "11",
      12: "12",
      13: "13",
      14: "14",
      15: "15",
    },
    showCancelButton: true,
  }).then((outP) => {
    if (outP.isConfirmed) {
      Swal.fire({
        title: "Select edition",
        input: "select",
        inputOptions: {
          troublebrewing: "Trouble Brewing",
        },
        showCancelButton: true,
      }).then((outE) => {
        if (outE.isConfirmed) {
          playerCount = parseInt(outP.value);
          edition = outE.value;
          saveHostState();
          socket.emit("host", { playerCount, edition });
        }
      });
    }
  });
});

joinBtn.addEventListener("click", () => {
  const room = roomInput.value.trim();
  const username = usernameInput.value.trim();
  if (room.length === 4 && /^[A-Z]{4}$/.test(room) && username) {
    if (currentUsernames.has(username)) {
      Swal.fire({
        title: "Username Taken",
        text: "This username is already in use in this room.",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
    socket.emit("join-room", { room, username });
  } else if (room.length !== 4) {
    Swal.fire({
      title: "Invalid Room Code",
      text: "Room code must be exactly 4 capitalized letters.",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
});

function leaveRoom() {
  if (currentRoom) {
    socket.emit("leave-room", currentRoom);
    if (isHost) {
      localStorage.removeItem(`botc-host-${currentRoom}`);
    }
    currentRoom = null;
    isHost = false;
    document.getElementById("hosted").style.display = "none";
    document.getElementById("joined").style.display = "none";
    document.getElementById("initial").style.display = "block";
    messages.innerHTML = "";
    window.history.replaceState(null, "", "/");
    window.location.reload();
  }
}

document
  .querySelector("#hosted #leaveBtn")
  .addEventListener("click", leaveRoom);
document
  .querySelector("#joined #leaveBtn")
  .addEventListener("click", leaveRoom);
document.getElementById("confirmRolesBtn").addEventListener("click", () => {
  showRoleCircle();
});

document.getElementById("revealRolesBtn").addEventListener("click", () => {
  socket.emit("reveal-roles", currentRoom);
  for (const username in assignedRoles) {
    const role = assignedRoles[username];
    const roleData = editionData.roles[role.category][role.role];
    socket.emit("assign-role", {
      room: currentRoom,
      username,
      role,
      roleData,
    });
  }
  revealed = true;
  saveHostState();
  document.getElementById("revealRolesBtn").style.display = "none";
});

document.querySelectorAll("#characterSheetBtn").forEach((btn) => {
  btn.addEventListener("click", showCharacterSheet);
});
document
  .getElementById("nightOrderBtn")
  .addEventListener("click", startNightOrder);
document.getElementById("timerBtn").addEventListener("click", showTimer);
document.querySelectorAll("#notesBtn").forEach((btn) => {
  btn.addEventListener("click", showNotes);
});
document
  .getElementById("customMessageBtn")
  .addEventListener("click", showCustomMessage);
document.querySelectorAll("#tokensBtn").forEach((btn) => {
  btn.addEventListener("click", showTokens);
});

socket.on("hosted", (code) => {
  currentRoom = code;
  isHost = true;
  fetch(`/editions/${edition}.json`)
    .then((response) => response.json())
    .then((data) => {
      editionData = data;
      nightOrder = data.nightorder;
      showRoleSelection();
    });
  document.getElementById("initial").style.display = "none";
  document.getElementById("hosted").style.display = "block";
  document.getElementById("roomCode").textContent = code;
  updateGlobalTimerDisplay();
  loadNotes();
  window.history.replaceState(null, "", `?type=host&room=${code}`);
});

socket.on("joined", (data) => {
  currentRoom = data.room;
  currentUsernames = new Set(data.usernames);
  document.getElementById("initial").style.display = "none";
  document.getElementById("joined").style.display = "block";
  document.getElementById("username").textContent = data.username;
  updateGlobalTimerDisplay();
  loadNotes();
  window.history.replaceState(
    null,
    "",
    `?type=join&room=${data.room}&username=${encodeURIComponent(data.username)}`,
  );
});

socket.on("reconnected-host", (code) => {
  currentRoom = code;
  isHost = true;
  const hasState = loadHostState(code);
  if (hasState) {
    fetch(`/editions/${edition}.json`)
      .then((response) => response.json())
      .then((data) => {
        editionData = data;
        nightOrder = data.nightorder;
        if (selectedRoles.length > 0) {
          showRoleCircle();
          if (revealed) {
            socket.emit("reveal-roles", currentRoom);
            for (const username in assignedRoles) {
              const role = assignedRoles[username];
              const roleData = editionData.roles[role.category][role.role];
              socket.emit("assign-role", {
                room: currentRoom,
                username,
                role,
                roleData,
              });
            }
          }
        } else {
          showRoleSelection();
        }
      });
  }
  document.getElementById("initial").style.display = "none";
  document.getElementById("hosted").style.display = "block";
  document.getElementById("roomCode").textContent = code;
  loadNotes();
});

socket.on("reconnected-join", (data) => {
  currentRoom = data.room;
  currentUsernames = new Set(data.usernames);
  document.getElementById("initial").style.display = "none";
  document.getElementById("joined").style.display = "block";
  document.getElementById("username").textContent = data.username;
  loadNotes();
});

socket.on("receive-info", (message) => {
  messages.innerHTML += `<p>Info: ${message}</p>`;
  messages.scrollTop = messages.scrollHeight;
});

socket.on("user-joined", (username) => {
  currentUsernames.add(username);
  messages.innerHTML += `<p>${username} joined the room</p>`;
  messages.scrollTop = messages.scrollHeight;
  if (isHost) {
    if (revealed) {
      socket.emit("reveal-roles", currentRoom);
    }
    assignRoleToPlayer(username);
  }
});

socket.on("user-left", (username) => {
  currentUsernames.delete(username);
});

socket.on("assigned-role", (data) => {
  const { role, roleData } = data;
  const params = new URLSearchParams(window.location.search);
  params.set("role", encodeURIComponent(JSON.stringify(data)));
  window.history.replaceState(null, "", `?${params.toString()}`);
  if (rolesRevealed) {
    const roleDisplay = document.getElementById("roleDisplay");
    roleDisplay.innerHTML = `
      <div class="role-token player-token">
        <img src="icons/${roleData[0]}.svg" alt="${role.role}" />
        <div class="role-name">${role.role}</div>
        <div class="role-description">${roleData[1]}</div>
      </div>
    `;
    document.getElementById("playerRole").style.display = "block";
  }
});

socket.on("roles-revealed", () => {
  rolesRevealed = true;
  const btn = document.getElementById("revealRolesBtn");
  if (btn) btn.style.display = "none";
});

socket.on("join-error", (msg) => {
  Swal.fire({
    title: "Join Error",
    text: msg,
    icon: "error",
    confirmButtonText: "OK",
  });
});

function showRoleSelection() {
  const categoriesDiv = document.getElementById("categories");
  categoriesDiv.innerHTML = "";

  Object.keys(editionData.roles).forEach((category) => {
    const categoryDiv = document.createElement("div");
    categoryDiv.className = "category";
    categoryDiv.innerHTML = `<h3>${category}: <span id="count-${category}">0</span></h3>`;
    const rolesDiv = document.createElement("div");
    rolesDiv.className = "roles";

    Object.keys(editionData.roles[category]).forEach((role) => {
      const roleData = editionData.roles[category][role];
      const roleDiv = document.createElement("div");
      roleDiv.className = "role-token";
      const isSelected = selectedRoles.some(
        (r) => r.category === category && r.role === role,
      );
      if (isSelected) roleDiv.classList.add("selected");
      roleDiv.innerHTML = `
        <img src="icons/${roleData[0]}.svg" alt="${role}" />
        <div class="role-name">${role}</div>
        <button class="info-btn">?</button>
      `;
      roleDiv.title = roleData[1];
      roleDiv.addEventListener("click", (e) => {
        if (e.target.classList.contains("info-btn")) {
          Swal.fire({
            title: role,
            text: roleData[1],
            confirmButtonText: "OK",
          });
        } else {
          toggleRoleSelection(category, role, roleDiv);
        }
      });
      rolesDiv.appendChild(roleDiv);
    });

    categoryDiv.appendChild(rolesDiv);
    categoriesDiv.appendChild(categoryDiv);
  });

  updateCategoryCounts();
  document.getElementById("roleSelection").style.display = "block";
}

function toggleRoleSelection(category, role, roleDiv) {
  const index = selectedRoles.findIndex(
    (r) => r.category === category && r.role === role,
  );
  if (index > -1) {
    selectedRoles.splice(index, 1);
    roleDiv.classList.remove("selected");
  } else {
    selectedRoles.push({ category, role });
    roleDiv.classList.add("selected");
  }
  updateCategoryCounts();
  saveHostState();
}

function updateCategoryCounts() {
  const counts = {};
  selectedRoles.forEach((r) => {
    counts[r.category] = (counts[r.category] || 0) + 1;
  });
  Object.keys(editionData.roles).forEach((category) => {
    const countSpan = document.getElementById(`count-${category}`);
    const selected = counts[category] || 0;
    const recommended = editionData.rolecount[category][playerCount];
    countSpan.textContent = `${selected}/${recommended}`;
    countSpan.style.color = selected < recommended ? "red" : "green";
  });
}

function showRoleCircle() {
  document.getElementById("roleSelection").style.display = "none";
  document.getElementById("roleCircle").style.display = "block";

  const container = document.getElementById("circleContainer");
  container.innerHTML = "";

  loadTokensToCircle();

  const numRoles = selectedRoles.length;
  const radius = 350;
  const centerX = 300;
  const centerY = 300;

  selectedRoles.forEach((roleObj, index) => {
    const angle = (index / numRoles) * 2 * Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const roleDiv = document.createElement("div");
    roleDiv.className = "role-token circle-token";
    roleDiv.style.left = `${x}px`;
    roleDiv.style.top = `${y}px`;
    roleDiv.innerHTML = `
      <img src="icons/${editionData.roles[roleObj.category][roleObj.role][0]}.svg" alt="${roleObj.role}" />
      <div class="role-name">${roleObj.role}</div>
    `;
    roleDiv.title = editionData.roles[roleObj.category][roleObj.role][1];

    const assignedUser = Object.keys(assignedRoles).find(
      (u) => assignedRoles[u].role === roleObj.role,
    );
    if (assignedUser) {
      roleDiv.innerHTML += `<div class="username">${assignedUser}</div>`;
    }

    makeCircleTokenDraggable(roleDiv, roleObj);

    container.appendChild(roleDiv);
  });
}

function assignRoleToPlayer(username) {
  if (selectedRoles.length === 0) return;

  let assigned = assignedRoles[username];
  if (!assigned) {
    const availableRoles = selectedRoles.filter(
      (r) => !Object.values(assignedRoles).some((a) => a.role === r.role),
    );
    if (availableRoles.length === 0) return;
    const randomIndex = Math.floor(Math.random() * availableRoles.length);
    assigned = availableRoles[randomIndex];
    assignedRoles[username] = assigned;
    saveHostState();
  }

  const roleData = editionData.roles[assigned.category][assigned.role];
  socket.emit("assign-role", {
    room: currentRoom,
    username,
    role: assigned,
    roleData,
  });
  if (document.getElementById("roleCircle").style.display === "block") {
    updateCircle();
  }
}

function updateCircle() {
  const tokens = document.querySelectorAll(".circle-token");
  tokens.forEach((token, index) => {
    const roleObj = selectedRoles[index];
    const assignedUser = Object.keys(assignedRoles).find(
      (u) => assignedRoles[u].role === roleObj.role,
    );
    let usernameDiv = token.querySelector(".username");
    if (assignedUser) {
      if (!usernameDiv) {
        usernameDiv = document.createElement("div");
        usernameDiv.className = "username";
        token.appendChild(usernameDiv);
      }
      usernameDiv.textContent = assignedUser;
    } else {
      if (usernameDiv) {
        usernameDiv.remove();
      }
    }
  });
}

function showCharacterSheet() {
  if (!editionData) {
    fetch(`/editions/troublebrewing.json`)
      .then((response) => response.json())
      .then((data) => {
        editionData = data;
        displayCharacterSheet();
      });
  } else {
    displayCharacterSheet();
  }
}

function displayCharacterSheet() {
  let html = "<div class='character-sheet'>";
  Object.keys(editionData.roles).forEach((category) => {
    html += `<h3>${category}</h3><div class='sheet-roles'>`;
    Object.keys(editionData.roles[category]).forEach((role) => {
      const roleData = editionData.roles[category][role];
      html += `
        <div class='sheet-role'>
          <img src='icons/${roleData[0]}.svg' alt='${role}' />
          <div class='sheet-role-name'>${role}</div>
          <div class='sheet-role-desc'>${roleData[1]}</div>
        </div>
      `;
    });
    html += "</div>";
  });
  html += "</div>";

  Swal.fire({
    title: "Character Sheet",
    html: html,
    width: "90%",
    customClass: {
      popup: "character-sheet-popup",
    },
    confirmButtonText: "Close",
  });
}

function startNightOrder() {
  currentNightIndex = 0;
  showNightPhase();
}

function showNightPhase() {
  if (currentNightIndex >= nightOrder.length) {
    Swal.fire({
      title: "Night Order Complete",
      text: "All night phases have been completed.",
      confirmButtonText: "OK",
    });
    return;
  }

  const phase = nightOrder[currentNightIndex];
  let html = `<p>${phase.text}</p>`;

  if (phase.messages && phase.messages.length > 0) {
    html += "<div class='message-buttons'>";
    phase.messages.forEach((message) => {
      html += `<button class="message-btn" data-message="${message}">${message}</button>`;
    });
    html += "</div>";
  }

  if (phase.tokenpresenter) {
    html += "<button id='selectTokensBtn'>Select Tokens to Show</button>";
  }

  const nextText =
    currentNightIndex < nightOrder.length - 1 ? "Next Phase" : "Finish Night";
  html += `<button id='nextPhaseBtn' style='margin-top: 20px;'>${nextText}</button>`;
  html += `<button id='closeNightOrderBtn' style='margin-left: 10px;'>Exit Night Order</button>`;

  Swal.fire({
    title: phase.title,
    html: html,
    width: "80%",
    showConfirmButton: false,
    allowOutsideClick: false,
    didOpen: () => {
      document.querySelectorAll(".message-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const message = e.target.dataset.message;
          showFullScreenMessage(message);
        });
      });

      const selectTokensBtn = document.getElementById("selectTokensBtn");
      if (selectTokensBtn) {
        selectTokensBtn.addEventListener("click", () => {
          showTokenSelection();
        });
      }

      document.getElementById("nextPhaseBtn").addEventListener("click", () => {
        currentNightIndex++;
        showNightPhase();
      });

      document
        .getElementById("closeNightOrderBtn")
        .addEventListener("click", () => {
          Swal.close();
        });
    },
  });
}

function showFullScreenMessage(message) {
  const overlay = document.createElement("div");
  overlay.className = "fullscreen-overlay";
  overlay.innerHTML = `
    <div class="fullscreen-content">
      <div class="fullscreen-text">${message}</div>
      <button class="fullscreen-close"></button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".fullscreen-close").addEventListener("click", () => {
    document.body.removeChild(overlay);
    showNightPhase();
  });
}

let timerInterval = null;
let timerSeconds = 0;

function showTimer() {
  const html = `
    <div class="timer-container">
      <div class="timer-display" id="timerDisplay">00:00</div>
      <div class="timer-presets">
        <button id="timer5MinBtn">5 Minutes</button>
        <button id="timer3MinBtn">3 Minutes</button>
        <button id="timer1MinBtn">1 Minute</button>
      </div>
      <div class="timer-controls">
        <button id="startTimerBtn">Start</button>
        <button id="pauseTimerBtn">Pause</button>
        <button id="resetTimerBtn">Reset</button>
      </div>
    </div>
  `;

  Swal.fire({
    title: "Timer",
    html: html,
    showConfirmButton: false,
    showCloseButton: true,
    allowOutsideClick: true,
    didOpen: () => {
      updateTimerDisplay();

      document.getElementById("timer5MinBtn").addEventListener("click", () => {
        timerSeconds = 5 * 60;
        updateTimerDisplay();
        updateGlobalTimerDisplay();
      });

      document.getElementById("timer3MinBtn").addEventListener("click", () => {
        timerSeconds = 3 * 60;
        updateTimerDisplay();
        updateGlobalTimerDisplay();
      });

      document.getElementById("timer1MinBtn").addEventListener("click", () => {
        timerSeconds = 1 * 60;
        updateTimerDisplay();
        updateGlobalTimerDisplay();
      });

      document.getElementById("startTimerBtn").addEventListener("click", () => {
        if (timerInterval) return;
        timerInterval = setInterval(() => {
          if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay();
            updateGlobalTimerDisplay();
          } else {
            clearInterval(timerInterval);
            timerInterval = null;
          }
        }, 1000);
      });

      document.getElementById("pauseTimerBtn").addEventListener("click", () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      });

      document.getElementById("resetTimerBtn").addEventListener("click", () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        timerSeconds = 0;
        updateTimerDisplay();
        updateGlobalTimerDisplay();
      });
    },
  });
}

function updateTimerDisplay() {
  const display = document.getElementById("timerDisplay");
  if (display) {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    display.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}

function updateGlobalTimerDisplay() {
  const display = document.getElementById("globalTimerDisplay");
  if (display) {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    display.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}

function loadNotes() {
  const username = isHost
    ? "host"
    : document.getElementById("username")?.textContent;
  if (!username) return;
  const storageKey = `botc-notes-${username}`;
  const savedNotes = localStorage.getItem(storageKey) || "";
  const textarea = document.getElementById("notesTextarea");
  if (textarea) {
    textarea.value = savedNotes;
  }
}

function saveNotes() {
  const username = isHost
    ? "host"
    : document.getElementById("username")?.textContent;
  if (!username) return;
  const storageKey = `botc-notes-${username}`;
  const textarea = document.getElementById("notesTextarea");
  if (textarea) {
    localStorage.setItem(storageKey, textarea.value);
  }
}

function showNotes() {
  const notesContainer = document.getElementById("notesContainer");
  if (
    notesContainer.style.display === "none" ||
    notesContainer.style.display === ""
  ) {
    notesContainer.style.display = "block";
    loadNotes();
    const textarea = document.getElementById("notesTextarea");
    if (textarea) {
      textarea.addEventListener("input", saveNotes);
    }
  } else {
    notesContainer.style.display = "none";
    saveNotes();
  }
}

function showCustomMessage() {
  Swal.fire({
    title: "Custom Fullscreen Message",
    input: "textarea",
    inputPlaceholder: "Enter your message...",
    showCancelButton: true,
    confirmButtonText: "Show Message",
    cancelButtonText: "Cancel",
    inputValidator: (value) => {
      if (!value) {
        return "Please enter a message!";
      } else {
        showFullScreenMessage(value);
      }
    },
  });
}

const tokenColors = [
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FFA500",
  "#800080",
  "#FFC0CB",
  "#A52A2A",
  "#808080",
  "#000000",
  "#FFFFFF",
  "#8B4513",
  "#DC143C",
  "#228B22",
];

let draggedToken = null;

function handleDrag(clientX, clientY, tokenElement, startX, startY, initialX, initialY, circleContainer, savedTokens, storageKey, selector) {
  const deltaX = clientX - startX;
  const deltaY = clientY - startY;
  const newX = Math.max(
    0,
    Math.min(
      initialX + deltaX,
      circleContainer.clientWidth - tokenElement.clientWidth,
    ),
  );
  const newY = Math.max(
    0,
    Math.min(
      initialY + deltaY,
      circleContainer.clientHeight - tokenElement.clientHeight,
    ),
  );
  tokenElement.style.left = `${newX}px`;
  tokenElement.style.top = `${newY}px`;

  if (savedTokens && storageKey && selector) {
    const index = Array.from(
      circleContainer.querySelectorAll(selector),
    ).indexOf(tokenElement);
    if (savedTokens[index]) {
      savedTokens[index].x = newX;
      savedTokens[index].y = newY;
      localStorage.setItem(storageKey, JSON.stringify(savedTokens));
    }
  }
}

function showTokens() {
  const username = isHost
    ? "host"
    : document.getElementById("username").textContent;
  const storageKey = `botc-tokens-${username}`;
  const savedTokens = JSON.parse(localStorage.getItem(storageKey) || "[]");

  let html = `
    <div class="token-manager">
      <div class="token-palette">
        ${tokenColors
          .map(
            (color, index) => `
          <div class="color-token" data-color="${color}" style="background-color: ${color};" title="Color ${index + 1}"></div>
        `,
          )
          .join("")}
      </div>
      <div class="token-controls">
        <button id="addTokenBtn">Add Selected Token</button>
        <button id="clearTokensBtn">Clear All Tokens</button>
      </div>
    </div>
  `;

  Swal.fire({
    title: "Add Tokens to Circle",
    html: html,
    width: "auto",
    showConfirmButton: false,
    didOpen: () => {
      let selectedColor = tokenColors[0];

      document.querySelectorAll(".color-token").forEach((token) => {
        token.addEventListener("click", () => {
          document
            .querySelectorAll(".color-token")
            .forEach((t) => t.classList.remove("selected"));
          token.classList.add("selected");
          selectedColor = token.dataset.color;
        });
      });

      document.querySelector(".color-token").classList.add("selected");

      document.getElementById("addTokenBtn").addEventListener("click", () => {
        addTokenToCircle(selectedColor, savedTokens, storageKey);
        Swal.close();
      });

      document
        .getElementById("clearTokensBtn")
        .addEventListener("click", () => {
          clearAllTokensFromCircle(savedTokens, storageKey);
          Swal.close();
        });
    },
  });
}

function addTokenToCircle(color, savedTokens, storageKey) {
  const circleContainer = document.getElementById("circleContainer");
  if (!circleContainer) return;

  const newToken = {
    color: color,
    x: Math.random() * (circleContainer.clientWidth - 30),
    y: Math.random() * (circleContainer.clientHeight - 30),
  };
  savedTokens.push(newToken);
  localStorage.setItem(storageKey, JSON.stringify(savedTokens));

  const tokenElement = document.createElement("div");
  tokenElement.className = "mini-token";
  tokenElement.style.backgroundColor = color;
  tokenElement.style.left = `${newToken.x}px`;
  tokenElement.style.top = `${newToken.y}px`;

  makeTokenDraggable(tokenElement, savedTokens, storageKey);
  circleContainer.appendChild(tokenElement);
}

function clearAllTokensFromCircle(savedTokens, storageKey) {
  const circleContainer = document.getElementById("circleContainer");
  if (!circleContainer) return;

  const miniTokens = circleContainer.querySelectorAll(".mini-token");
  miniTokens.forEach((token) => circleContainer.removeChild(token));

  savedTokens.length = 0;
  localStorage.setItem(storageKey, JSON.stringify(savedTokens));
}

function makeTokenDraggable(tokenElement, savedTokens, storageKey) {
  let isDragging = false;
  let startX, startY, initialX, initialY;
  const circleContainer = document.getElementById("circleContainer");

  tokenElement.addEventListener("dblclick", (e) => {
    e.preventDefault();
    const index = Array.from(
      circleContainer.querySelectorAll(".mini-token"),
    ).indexOf(tokenElement);
    if (index > -1) {
      savedTokens.splice(index, 1);
      localStorage.setItem(storageKey, JSON.stringify(savedTokens));
    }
    circleContainer.removeChild(tokenElement);
  });

  let lastTap = 0;
  tokenElement.addEventListener("touchend", (e) => {
    const currentTime = new Date().getTime();
    const tapGap = currentTime - lastTap;
    if (tapGap < 300 && tapGap > 0) {
      e.preventDefault();
      const index = Array.from(
        circleContainer.querySelectorAll(".mini-token"),
      ).indexOf(tokenElement);
      if (index > -1) {
        savedTokens.splice(index, 1);
        localStorage.setItem(storageKey, JSON.stringify(savedTokens));
      }
      circleContainer.removeChild(tokenElement);
    }
    lastTap = currentTime;
  });

  tokenElement.addEventListener("mousedown", (e) => {
    if (e.detail === 2) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = tokenElement.getBoundingClientRect();
    const containerRect = circleContainer.getBoundingClientRect();
    initialX = rect.left - containerRect.left;
    initialY = rect.top - containerRect.top;
    tokenElement.style.zIndex = "1000";
    e.preventDefault();
  });

  tokenElement.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = tokenElement.getBoundingClientRect();
      const containerRect = circleContainer.getBoundingClientRect();
      initialX = rect.left - containerRect.left;
      initialY = rect.top - containerRect.top;
      tokenElement.style.zIndex = "1000";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    handleDrag(e.clientX, e.clientY, tokenElement, startX, startY, initialX, initialY, circleContainer, savedTokens, storageKey, ".mini-token");
  });

  document.addEventListener("touchmove", (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    handleDrag(touch.clientX, touch.clientY, tokenElement, startX, startY, initialX, initialY, circleContainer, savedTokens, storageKey, ".mini-token");
    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      tokenElement.style.zIndex = "";
    }
  });

  document.addEventListener("touchend", () => {
    if (isDragging) {
      isDragging = false;
      tokenElement.style.zIndex = "";
    }
  });
}

function makeCircleTokenDraggable(tokenElement, roleObj) {
  let isDragging = false;
  let hasDragged = false;
  let startX, startY, initialX, initialY;
  const circleContainer = document.getElementById("circleContainer");
  const dragThreshold = 10;

  tokenElement.addEventListener("mousedown", (e) => {
    isDragging = true;
    hasDragged = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = tokenElement.getBoundingClientRect();
    const containerRect = circleContainer.getBoundingClientRect();
    initialX = rect.left - containerRect.left;
    initialY = rect.top - containerRect.top;
    tokenElement.style.zIndex = "1000";
    e.preventDefault();
  });

  tokenElement.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      hasDragged = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = tokenElement.getBoundingClientRect();
      const containerRect = circleContainer.getBoundingClientRect();
      initialX = rect.left - containerRect.left;
      initialY = rect.top - containerRect.top;
      tokenElement.style.zIndex = "1000";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
      hasDragged = true;
    }
    handleDrag(e.clientX, e.clientY, tokenElement, startX, startY, initialX, initialY, circleContainer, null, null, null);
  });

  document.addEventListener("touchmove", (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
      hasDragged = true;
    }
    handleDrag(touch.clientX, touch.clientY, tokenElement, startX, startY, initialX, initialY, circleContainer, null, null, null);
    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      tokenElement.style.zIndex = "";
      if (!hasDragged) {
        showFullScreenTokens([roleObj]);
      }
    }
  });

  document.addEventListener("touchend", () => {
    if (isDragging) {
      isDragging = false;
      tokenElement.style.zIndex = "";
      if (!hasDragged) {
        showFullScreenTokens([roleObj]);
      }
    }
  });
}

function loadTokensToCircle() {
  const username = isHost
    ? "host"
    : document.getElementById("username")
      ? document.getElementById("username").textContent
      : null;
  if (!username) return;

  const storageKey = `botc-tokens-${username}`;
  const savedTokens = JSON.parse(localStorage.getItem(storageKey) || "[]");
  const circleContainer = document.getElementById("circleContainer");

  if (circleContainer) {
    const existingTokens = circleContainer.querySelectorAll(".mini-token");
    existingTokens.forEach((token) => circleContainer.removeChild(token));

    savedTokens.forEach((token) => {
      const tokenElement = document.createElement("div");
      tokenElement.className = "mini-token";
      tokenElement.style.backgroundColor = token.color;
      tokenElement.style.left = `${token.x}px`;
      tokenElement.style.top = `${token.y}px`;

      makeTokenDraggable(tokenElement, savedTokens, storageKey);
      circleContainer.appendChild(tokenElement);
    });
  }
}

function showTokenSelection() {
  let html =
    "<div class='token-selection-modal'><div class='token-selection-grid'>";
  Object.keys(editionData.roles).forEach((category) => {
    Object.keys(editionData.roles[category]).forEach((role) => {
      const roleData = editionData.roles[category][role];
      html += `
        <div class="selectable-token" data-category="${category}" data-role="${role}">
          <img src="icons/${roleData[0]}.svg" alt="${role}" />
          <div class="selectable-token-name">${role}</div>
        </div>
      `;
    });
  });
  html +=
    "</div><div class='token-selection-controls'><button id='showSelectedTokensBtn'>Show Selected Tokens</button><button id='cancelTokenSelectionBtn'>Cancel</button></div></div>";

  Swal.fire({
    title: "Select Tokens to Show",
    html: html,
    width: window.innerWidth < 768 ? "95%" : "80%",
    heightAuto: false,
    customClass: {
      popup: "token-selection-popup",
    },
    showConfirmButton: false,
    didOpen: () => {
      const tokens = document.querySelectorAll(".selectable-token");
      const selectedRoles = [];

      tokens.forEach((token) => {
        token.addEventListener("click", () => {
          token.classList.toggle("selected");
          const roleObj = {
            category: token.dataset.category,
            role: token.dataset.role,
          };
          const index = selectedRoles.findIndex(
            (r) => r.category === roleObj.category && r.role === roleObj.role,
          );
          if (index > -1) {
            selectedRoles.splice(index, 1);
          } else {
            selectedRoles.push(roleObj);
          }
        });
      });

      document
        .getElementById("showSelectedTokensBtn")
        .addEventListener("click", () => {
          if (selectedRoles.length > 0) {
            Swal.close();
            showFullScreenTokens(selectedRoles);
          } else {
            Swal.showValidationMessage("Please select at least one token");
          }
        });

      document
        .getElementById("cancelTokenSelectionBtn")
        .addEventListener("click", () => {
          Swal.close();
          showNightPhase();
        });
    },
  });
}

function showFullScreenTokens(selectedRoleObjects) {
  const overlay = document.createElement("div");
  overlay.className = "fullscreen-overlay";
  let html = "<div class='fullscreen-tokens'>";
  selectedRoleObjects.forEach((roleObj) => {
    const roleData = editionData.roles[roleObj.category][roleObj.role];
    html += `
      <div class='fullscreen-token'>
        <img src="icons/${roleData[0]}.svg" alt="${roleObj.role}" />
        <div>${roleObj.role}</div>
      </div>
    `;
  });
  html += "</div><button class='fullscreen-close'></button>";
  overlay.innerHTML = `<div class="fullscreen-content">${html}</div>`;
  document.body.appendChild(overlay);

  overlay.querySelector(".fullscreen-close").addEventListener("click", () => {
    document.body.removeChild(overlay);
    showNightPhase();
  });
}
