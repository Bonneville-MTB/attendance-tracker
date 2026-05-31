(function() {
const API_URL =
  "https://script.google.com/macros/s/AKfycby_h-KPf0X7CRk0lgbZ_nfHakJAlCgkRCMXOqh3AAoWttJ8feRiym3v2t8NGXp0i9eo/exec";

// Global Variables
let appData = {};
let selectedCoach = null;
let tempRoster = [];

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.onload = function () {
  // Get the exact local date and format it as YYYY-MM-DD
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  document.getElementById("attendanceDate").value = `${yyyy}-${mm}-${dd}`;

  showScreen("screen-login");
};

function unlockApp() {
  const teamPassword = document.getElementById("teamPassword").value;
  if (!teamPassword) {
    document.getElementById("loginError").textContent = "Please enter the team password.";
    return;
  }
  
  document.getElementById("loginError").style.color = "#333";
  document.getElementById("loginError").textContent = "Loading data...";

  fetch(API_URL + "?action=getInitialData&password=" + encodeURIComponent(teamPassword))
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        throw new Error(data.error);
      }
      document.getElementById("loginError").textContent = "";
      initApp(data);
    })
    .catch((error) => {
      document.getElementById("loginError").style.color = "#ea4335";
      document.getElementById("loginError").textContent = error.message;
    });
};

function initApp(data) {
  appData = data;
  const coachSelect = document.getElementById("coachSelect");
  data.coaches.forEach((c) => {
    let opt = document.createElement("option");
    opt.value = c.name;
    opt.dataset.group = c.defaultGroup;
    opt.textContent = c.name;
    coachSelect.appendChild(opt);
  });

  const levelSelect = document.getElementById("levelFilter");
  data.levels.forEach((l) => {
    let opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l;
    levelSelect.appendChild(opt);
  });

  // loading element removed
  showScreen("screen-coach");
}

function startAttendance() {
  const select = document.getElementById("coachSelect");
  if (!select.value) return alert("Please select a coach first.");

  selectedCoach = {
    name: select.value,
    defaultGroup: select.options[select.selectedIndex].dataset.group,
  };

  const levelFilter = document.getElementById("levelFilter");
  levelFilter.value =
    selectedCoach.defaultGroup &&
    [...levelFilter.options].some((o) => o.value == selectedCoach.defaultGroup)
      ? selectedCoach.defaultGroup
      : "All";

  renderAthleteList();
  showScreen("screen-attendance");
}

let debounceTimer;
function onSearchChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderAthleteList, 300);
}

function renderAthleteList() {
  const listDiv = document.getElementById("athleteList");
  listDiv.innerHTML = "";
  const filterLevel = document.getElementById("levelFilter").value;
  const filterName = document.getElementById("nameSearch").value.toLowerCase();

  const filtered = appData.athletes.filter((a) => {
    const matchesLevel =
      filterLevel === "All" || String(a.level) === filterLevel;
    const matchesName = a.name.toLowerCase().includes(filterName);
    const notInRoster = !tempRoster.includes(a.name);
    return matchesLevel && matchesName && notInRoster;
  });

  if (filtered.length === 0) {
    listDiv.innerHTML =
      '<div style="padding: 12px; color: #666;">No athletes found.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((a) => {
    const div = document.createElement("div");
    div.className = "athlete-item";
    div.innerHTML = `
      <label style="display:flex; align-items:center; margin:0; width:100%; cursor:pointer;">
        <input type="checkbox" value="${escapeHTML(a.name)}">
        <span>${escapeHTML(a.name)} <span class="badge">${escapeHTML(a.level)}</span></span>
      </label>`;
    fragment.appendChild(div);
  });
  listDiv.appendChild(fragment);
}

function markAll() {
  document
    .querySelectorAll('#athleteList input[type="checkbox"]')
    .forEach((cb) => (cb.checked = true));
}

function clearSelection() {
  document
    .querySelectorAll('#athleteList input[type="checkbox"]')
    .forEach((cb) => (cb.checked = false));
}

function addToRoster() {
  document
    .querySelectorAll('#athleteList input[type="checkbox"]:checked')
    .forEach((cb) => tempRoster.push(cb.value));
  document.getElementById("rosterCount").textContent = tempRoster.length;
  document.getElementById("nameSearch").value = "";
  renderAthleteList();
}

function goToReview() {
  if (tempRoster.length === 0) return alert("Your roster is empty.");
  document.getElementById("reviewCoach").textContent = selectedCoach.name;
  document.getElementById("reviewDate").textContent =
    document.getElementById("attendanceDate").value;
  renderReviewList();
  showScreen("screen-review");
}

function renderReviewList() {
  const listDiv = document.getElementById("reviewList");
  listDiv.innerHTML = "";
  const fragment = document.createDocumentFragment();
  tempRoster.forEach((name, index) => {
    const div = document.createElement("div");
    div.className = "review-item";
    div.innerHTML = `<span>${escapeHTML(name)}</span><button class="danger" onclick="removeFromRoster(${index})">Remove</button>`;
    fragment.appendChild(div);
  });
  listDiv.appendChild(fragment);
}

function removeFromRoster(index) {
  tempRoster.splice(index, 1);
  document.getElementById("rosterCount").textContent = tempRoster.length;
  tempRoster.length === 0 ? backToAttendance() : renderReviewList();
}

function backToAttendance() {
  renderAthleteList();
  showScreen("screen-attendance");
}

function submitData() {
  const pinVal = document.getElementById("coachPin").value;
  if (!pinVal) {
    alert("Please enter your Coach PIN to submit attendance.");
    return;
  }

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting...";
  const dateVal = document.getElementById("attendanceDate").value;
  const trailVal = document.getElementById("trailName").value;
  const rawMiles = document.getElementById("rideMiles").value;
  const milesVal = rawMiles ? parseFloat(rawMiles) : "";
  const rawElevation = document.getElementById("rideElevation").value;
  const elevationVal = rawElevation ? parseInt(rawElevation, 10) : "";

  const records = tempRoster.map((name) => ({
    date: dateVal,
    name: name,
    coach: selectedCoach.name,
    trail: trailVal,
    miles: milesVal,
    elevation: elevationVal,
  }));

  fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ records: records, pin: pinVal, coachName: selectedCoach.name }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) {
        throw new Error(data.message || "Unknown error");
      }
      alert(data.message);
      tempRoster = [];
      document.getElementById("rosterCount").textContent = "0";
      document.getElementById("trailName").value = "";
      document.getElementById("rideMiles").value = "";
      document.getElementById("rideElevation").value = "";
      document.getElementById("coachPin").value = "";
      btn.disabled = false;
      btn.textContent = "Submit Attendance";
      showScreen("screen-coach");
    })
    .catch((err) => {
      alert("Error: " + err.message);
      btn.disabled = false;
      btn.textContent = "Submit Attendance";
    });
}

function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

  window.startAttendance = startAttendance;
  window.renderAthleteList = renderAthleteList;
  window.onSearchChange = onSearchChange;
  window.markAll = markAll;
  window.clearSelection = clearSelection;
  window.addToRoster = addToRoster;
  window.goToReview = goToReview;
  window.renderReviewList = renderReviewList;
  window.removeFromRoster = removeFromRoster;
  window.backToAttendance = backToAttendance;
  window.submitData = submitData;
  window.unlockApp = unlockApp;
})();
