/* In order to run locally

Change headless to false instead of "new"
export START_HOUR=11
export BL_ACCOUNTS='[{"username":"bqiu15","password":"yourpassword"}]'
export MANUAL_RUN="true"
node login.js

*/

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const moment = require("moment-timezone");
puppeteer.use(StealthPlugin());

(async () => {
  const manualRun = process.env.MANUAL_RUN === "true";

  if (!manualRun) {
    const now = moment().tz("America/New_York");
    const isSunday = now.format("dddd") === "Sunday";
    const isMidnight = now.format("HH:mm") === "00:00";

    if (!isSunday || !isMidnight) {
      console.log(`Skipping scheduled run — current Eastern time is ${now.format()}`);
      process.exit(0);
    }
  } else {
    console.log("Manual trigger detected — running regardless of time.");
  }

  const accounts = JSON.parse(process.env.BL_ACCOUNTS);

  // Read start hour from environment variable, default to 11 if not set
  const startHour = parseInt(process.env.START_HOUR, 10) || 11;
  const durationHours = 1; // You can also make this configurable if desired
  const endHour = startHour + durationHours;

  for (const account of accounts) {
    console.log(`Logging in as: ${account.username}`);

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

      await page.focus("#UserName");
      await page.keyboard.type(account.username, { delay: 20 });

      await page.focus("#Password");
      await page.keyboard.type(account.password, { delay: 20 });

      await Promise.all([
        page.click("#LoginButton"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      console.log(`${account.username}: Login successful.`);

      const today = moment().tz("America/New_York").format("MM/DD/YYYY");

      const reservationUrl = `https://harbourviewestates.buildinglink.com/v2/tenant/Amenities/NewReservation.aspx?amenityId=61232&from=0&selectedDate=${today}`;

      console.log(`Navigating to: ${reservationUrl}`);
      await page.goto(reservationUrl, { waitUntil: "networkidle2" });

      await page.waitForSelector(
        "#ctl00_ContentPlaceHolder1_StartTimePicker_dateInput",
        { visible: true, timeout: 15000 }
      );

      // -----------------------------
      // Set reservation time dynamically
      // -----------------------------
      await page.evaluate((startHour, endHour) => {
        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");

        function formatHour(hour24) {
          const period = hour24 >= 12 ? "PM" : "AM";
          const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
          return `${hour12}:00 ${period}`;
        }

        const startDisplay = formatHour(startHour);
        const endDisplay = formatHour(endHour);

        const startValidation = `${yyyy}-${mm}-${dd}-${String(startHour).padStart(2, "0")}-00-00`;
        const endValidation = `${yyyy}-${mm}-${dd}-${String(endHour).padStart(2, "0")}-00-00`;

        function updateTimePicker(baseId, displayValue, validationValue) {
          const visible = document.querySelector(`#${baseId}_dateInput`);
          if (visible) visible.value = displayValue;

          const hiddenState = document.querySelector(`#${baseId}_dateInput_ClientState`);
          if (hiddenState) {
            const stateObj = JSON.parse(hiddenState.value);
            stateObj.validationText = validationValue;
            stateObj.valueAsString = validationValue;
            stateObj.lastSetTextBoxValue = displayValue;
            hiddenState.value = JSON.stringify(stateObj);
          }

          const mainState = document.querySelector(`#${baseId}_ClientState`);
          if (mainState && hiddenState) {
            mainState.value = hiddenState.value;
          }
        }

        updateTimePicker("ctl00_ContentPlaceHolder1_StartTimePicker", startDisplay, startValidation);
        updateTimePicker("ctl00_ContentPlaceHolder1_EndTimePicker", endDisplay, endValidation);
      }, startHour, endHour);

      console.log(`Time successfully set to ${startHour}:00.`);

      const waiverContainerSelector = "#ctl00_ContentPlaceHolder1_containerLiabilityWaiverAgreeCheckbox .checkbox-label-wrap";
      await page.waitForSelector(waiverContainerSelector, { visible: true });
      await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, waiverContainerSelector);
      await new Promise(r => setTimeout(r, 200));
      await page.click(waiverContainerSelector);

      const saveButtonSelector = "#ctl00_ContentPlaceHolder1_FooterSaveButton";
      await page.waitForSelector(saveButtonSelector, { visible: true });
      await new Promise(r => setTimeout(r, 200));
      await page.click(saveButtonSelector);

      console.log("Save button clicked successfully.");
      await page.screenshot({ path: `${account.username}.png` });
    } catch (err) {
      console.error(`${account.username}: Login failed.`, err);
    } finally {
      await browser.close();
    }
  }
})();
