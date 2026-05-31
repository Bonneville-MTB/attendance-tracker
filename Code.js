// API Backend for Attendance Tracker
function doGet(e) {
  // 1. Check if this is an API request for initial data
  if (e && e.parameter && e.parameter.action === 'getInitialData') {
    try {
      var data = getInitialData();
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 2. Otherwise, serve the standard web app HTML (keeps your existing app working during the transition!)
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("MTB Attendance Tracker")
    .addMetaTag("viewport", "width=device-width, initial-scale=1"); // Ensures mobile responsiveness
}

// Handle POST requests from the new GitHub frontend
function doPost(e) {
  try {
    // Parse the incoming JSON data from the fetch() request
    var requestData = JSON.parse(e.postData.contents);
    
    // Validate payload
    if (!requestData.records || !Array.isArray(requestData.records)) {
      throw new Error("Invalid payload: 'records' must be an array.");
    }
    
    // Verify the Coach PIN
    verifyCoachPin(requestData.coachName, requestData.pin);
    
    // Call your existing function
    var resultMessage = submitAttendance(requestData.records);
    
    // Return success response
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: resultMessage }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function verifyCoachPin(coachName, pin) {
  if (!coachName || !pin) {
    throw new Error("Coach name and PIN are required.");
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var coachSheet = ss.getSheetByName("Coaches");
  // Assuming Name is Col A, Default Group is Col B, Inactive is Col C, PIN is Col D
  var coachData = coachSheet
    .getRange(2, 1, coachSheet.getLastRow() - 1, 4) 
    .getValues();
  
  for (var i = 0; i < coachData.length; i++) {
    var name = coachData[i][0];
    var storedPin = coachData[i][3]; // Column D
    if (name === coachName) {
      if (storedPin !== "" && String(storedPin).trim() === String(pin).trim()) {
        return true;
      } else {
        throw new Error("Invalid PIN for coach: " + coachName);
      }
    }
  }
  throw new Error("Coach not found: " + coachName);
}

// Helper function to include separate HTML/JS files
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error("You do not have permission to access the underlying spreadsheet.");
    }

  // Fetch Coaches
  var coachSheet = ss.getSheetByName("Coaches");
  var coachData = coachSheet
    .getRange(2, 1, coachSheet.getLastRow() - 1, 3)
    .getValues();
  var coaches = coachData
    .filter(function (row) {
      // row[0] is Name, row[2] is Inactive (Column C)
      // We want to keep coaches that have a name AND are NOT marked as inactive
      return row[0] !== "" && row[2] !== true;
    })
    .map(function (row) {
      return { name: row[0], defaultGroup: row[1] };
    });

  // Fetch Athletes
  var athleteSheet = ss.getSheetByName("Athletes");
  var athleteData = athleteSheet
    .getRange(2, 1, athleteSheet.getLastRow() - 1, 2)
    .getValues();
  var athletes = athleteData
    .map(function (row) {
      return { name: row[0], level: row[1] };
    })
    .filter(function (a) {
      return a.name !== "";
    });

  // Get unique levels for the dropdown filter
  var levels = [...new Set(athletes.map((a) => a.level))].filter(Boolean);

  return {
    coaches: coaches,
    athletes: athletes,
    levels: levels,
  };
  } catch (e) {
    throw new Error("Spreadsheet access error: " + e.message);
  }
}

// Prevent CSV Formula Injection
function sanitizeCSV(val) {
  if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
    return "'" + val;
  }
  return val;
}

function submitAttendance(records) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Wait up to 10 seconds for concurrent tasks to finish

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Attendance");
    var timezone = ss.getSpreadsheetTimeZone();

    // 1. Get existing data to check for duplicates
    var lastRow = sheet.getLastRow();
    var existingData = [];
    if (lastRow > 1) {
      // Assuming row 1 has headers
      // Get Date, Player Name, and Coach (Columns A, B, C)
      existingData = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    }

    // 2. Create a Set of existing "signatures" for fast lookup
    // Signature format: "YYYY-MM-DD|PlayerName|Coach"
    var existingSignatures = new Set(
      existingData.map(function (row) {
        var sheetDate = row[0];
        var dateString = "";

        // Format the date from the sheet to match the HTML date input (YYYY-MM-DD)
        if (sheetDate instanceof Date) {
          dateString = Utilities.formatDate(sheetDate, timezone, "yyyy-MM-dd");
        } else {
          dateString = String(sheetDate).trim();
        }

        return (
          dateString + "|" + String(row[1]).trim() + "|" + String(row[2]).trim()
        );
      }),
    );

    // 3. Filter the incoming records
    var newRows = [];
    records.forEach(function (record) {
      var signature =
        record.date + "|" + record.name.trim() + "|" + record.coach.trim();

      // Only add to newRows if this signature doesn't already exist in the sheet
      if (!existingSignatures.has(signature)) {
        newRows.push([
          record.date, 
          sanitizeCSV(record.name), 
          sanitizeCSV(record.coach), 
          "Present", 
          sanitizeCSV(record.trail || ""), 
          record.miles || "", 
          record.elevation || ""
        ]);
        // Add it to the set so we don't add duplicates within the same submission batch
        existingSignatures.add(signature);
      }
    });

    // 4. Append only the new, unique rows
    if (newRows.length > 0) {
      // We use sheet.getLastRow() again just in case someone else added a row while this script was running
      sheet
        .getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length)
        .setValues(newRows);
      return "Successfully added " + newRows.length + " new attendance records.";
    } else {
      return "No new records added. All selected athletes were already marked present for this date and coach.";
    }
  } catch (e) {
    throw new Error("Could not acquire lock to save data or another error occurred: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

