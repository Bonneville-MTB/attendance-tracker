const API_URL =
  "https://script.google.com/macros/s/AKfycbxP0pHRcunmj3UyB37vjsQS7-YmbjqSg9TARcvklXpFBwyeREGYiG09cieTP9R1I3dN/exec";

// Global Variables
let appData = {};
let selectedCoach = null;
let tempRoster = [];

window.onload = function () {
  // Get the exact local date and format it as YYYY-MM-DD
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  document.getElementById("attendanceDate").value = `${yyyy}-${mm}-${dd}`;

  let loadingTimeout = setTimeout(function () {
    const loadingEl = document.getElementById("loading");
    if (loadingEl) {
      loadingEl.innerHTML =
        "<div style='color: #d32f2f; padding: 20px; text-align: center; border: 1px solid #f5c6cb; background-color: #f8d7da; border-radius: 4px; margin: 20px;'>" +
        "<h3>Access Denied or Timeout</h3>" +
        "<p>We could not load the data from the spreadsheet.</p>" +
        "<p>This usually happens if you do not have permission to access the underlying spreadsheet.</p>" +
        "<p>Please make sure you are logged into the correct Google account, or ask an administrator for access.</p>" +
        "</div>";
    }
  }, 8000); // 8 seconds timeout

  fetch(API_URL + "?action=getInitialData")
    .then((response) => response.json())
    .then((data) => {
      clearTimeout(loadingTimeout);
      if (data.error) {
        throw new Error(data.error);
      }
      initApp(data);
    })
    .catch((error) => {
      clearTimeout(loadingTimeout);
      document.getElementById("loading").innerHTML =
        "<div style='color: #d32f2f; padding: 20px; text-align: center; border: 1px solid #f5c6cb; background-color: #f8d7da; border-radius: 4px; margin: 20px;'>" +
        "<h3>Access Denied</h3>" +
        "<p>You do not have permission to access the underlying spreadsheet.</p>" +
        "<p>Please make sure you are logged into the correct Google account, or ask an administrator for access.</p>" +
        "<p style='font-size: 0.8em; margin-top: 10px; color: #666;'>Error details: " +
        error.message +
        "</p>" +
        "</div>";
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

  document.getElementById("loading").style.display = "none";
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

  filtered.forEach((a) => {
    const div = document.createElement("div");
    div.className = "athlete-item";
    div.innerHTML = `
      <label style="display:flex; align-items:center; margin:0; width:100%; cursor:pointer;">
        <input type="checkbox" value="${a.name}">
        <span>${a.name} <span class="badge">${a.level}</span></span>
      </label>`;
    listDiv.appendChild(div);
  });
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
  tempRoster.forEach((name, index) => {
    const div = document.createElement("div");
    div.className = "review-item";
    div.innerHTML = `<span>${name}</span><button class="danger" onclick="removeFromRoster(${index})">Remove</button>`;
    listDiv.appendChild(div);
  });
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
  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting...";
  const dateVal = document.getElementById("attendanceDate").value;
  const trailVal = document.getElementById("trailName").value;
  const milesVal = document.getElementById("rideMiles").value;
  const elevationVal = document.getElementById("rideElevation").value;

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
    body: JSON.stringify({ records: records }),
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
