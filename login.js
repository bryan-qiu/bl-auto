/* In order to run locally


Change headless to false instead of "new"
export START_HOUR=11
export RESERVE_DATE=11/20/2025
export BL_ACCOUNTS='[{"username":"bqiu15","password":"yourpassword"}]'
export MANUAL_RUN="true"
node login.js

*/

/* This script expects the following environment variables:
 *
 *  - MANUAL_RUN=true/false
 *  - BL_ACCOUNTS='[{"username":"user","password":"pass"}]'
 *  - START_HOUR=##   (24-hour format)
 *  - RESERVE_DATE=MM/DD/YYYY
 *
 *  ALL defaults are handled by GitHub Actions, not here.
 */

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const moment = require("moment-timezone");

puppeteer.use(StealthPlugin());

(async () => {
  const manualRun = process.env.MANUAL_RUN === "true";
  const reserveDate = process.env.RESERVE_DATE;
  const startHour = parseInt(process.env.START_HOUR, 10);
  const durationHours = 1;
  const endHour = startHour + durationHours;

  // -------- Input validation --------
  if (!reserveDate) {
    console.error("❌ RESERVE_DATE was not provided. Aborting.");
    process.exit(1);
  }

  if (!moment(reserveDate, "MM/DD/YYYY", true).isValid()) {
    console.error(`❌ Invalid RESERVE_DATE format: "${reserveDate}". Expected MM/DD/YYYY`);
    process.exit(1);
  }

  if (isNaN(startHour)) {
    console.error("❌ START_HOUR is missing or invalid.");
    process.exit(1);
  }

  console.log(`🗓  Reservation Date: ${reserveDate}`);
  console.log(`⏰ Reservation Time: ${startHour}:00–${endHour}:00`);
  console.log(`🔧 Manual run: ${manualRun}`);

  // -------- Time-based guard for scheduled runs --------
  if (!manualRun) {
    const now = moment().tz("America/New_York");
    const isSunday = now.format("dddd") === "Sunday";
    const isMidnight = now.format("HH:mm") === "00:00";

    if (!isSunday || !isMidnight) {
      console.log(
        `⏭ Skipping scheduled run — current Eastern time is ${now.format()}`
      );
      process.exit(0);
    }
  }

  // -------- Parse account list --------
  let accounts;
  try {
    accounts = JSON.parse(process.env.BL_ACCOUNTS);
  } catch (err) {
    console.error("❌ Failed to parse BL_ACCOUNTS:", err);
    process.exit(1);
  }

  // -------- Puppeteer logic for each account --------
  for (const account of accounts) {
    console.log(`🔐 Logging in as: ${account.username}`);

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    try {
      await page.goto(
        "https://harbourviewestates.buildinglink.com/V2/Tenant/Home/DefaultNew.aspx",
        { waitUntil: "networkidle2" }
      );

      await page.waitForSelector("#UserName", { visible: true });
      await page.waitForSelector("#Password", { visible: true });

      await page.type("#UserName", account.username, { delay: 20 });
      await page.type("#Password", account.password, { delay: 20 });

      await Promise.all([
        page.click("#LoginButton"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      console.log(`✔ ${account.username}: Login successful.`);

      const reservationUrl =
        `https://harbourviewestates.buildinglink.com/v2/tenant/Amenities/NewReservation.aspx` +
        `?amenityId=61232&from=0&selectedDate=${reserveDate}`;

      console.log(`🌐 Navigating to reservation page: ${reservationUrl}`);
      await page.goto(reservationUrl, { waitUntil: "networkidle2" });

      // Time picker interactions
      await page.waitForSelector(
        "#ctl00_ContentPlaceHolder1_StartTimePicker_dateInput",
        { visible: true, timeout: 15000 }
      );

      await page.evaluate(
        (startHour, endHour, reserveDate) => {
          const [mm, dd, yyyy] = reserveDate.split("/");

          function formatHour(hour24) {
            const period = hour24 >= 12 ? "PM" : "AM";
            const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
            return `${hour12}:00 ${period}`;
          }

          const startDisplay = formatHour(startHour);
          const endDisplay = formatHour(endHour);

          const startVal = `${yyyy}-${mm}-${dd}-${String(startHour).padStart(
            2,
            "0"
          )}-00-00`;

          const endVal = `${yyyy}-${mm}-${dd}-${String(endHour).padStart(
            2,
            "0"
          )}-00-00`;

          function update(baseId, display, value) {
            const visible = document.querySelector(`#${baseId}_dateInput`);
            if (visible) visible.value = display;

            const hidden = document.querySelector(
              `#${baseId}_dateInput_ClientState`
            );
            if (hidden) {
              const stateObj = JSON.parse(hidden.value);
              stateObj.validationText = value;
              stateObj.valueAsString = value;
              stateObj.lastSetTextBoxValue = display;
              hidden.value = JSON.stringify(stateObj);
            }

            const mainState = document.querySelector(`#${baseId}_ClientState`);
            if (mainState && hidden) {
              mainState.value = hidden.value;
            }
          }

          update(
            "ctl00_ContentPlaceHolder1_StartTimePicker",
            startDisplay,
            startVal
          );
          update(
            "ctl00_ContentPlaceHolder1_EndTimePicker",
            endDisplay,
            endVal
          );
        },
        startHour,
        endHour,
        reserveDate
      );

      console.log(`⏰ Time set successfully.`);

      // Liability checkbox
      const waiverSelector =
        "#ctl00_ContentPlaceHolder1_containerLiabilityWaiverAgreeCheckbox .checkbox-label-wrap";
      await page.waitForSelector(waiverSelector, { visible: true });
      await page.click(waiverSelector);

      // Save
      const saveButton = "#ctl00_ContentPlaceHolder1_FooterSaveButton";
      await page.waitForSelector(saveButton, { visible: true });
      await page.click(saveButton);

      console.log("💾 Save button clicked.");

      // Screenshot
      await page.screenshot({ path: `${account.username}.png` });
    } catch (err) {
      console.error(`❌ ${account.username}: Error`, err);
    } finally {
      await browser.close();
    }
  }
})();
