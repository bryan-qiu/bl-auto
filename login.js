const puppeteer = require("puppeteer");
const moment = require("moment-timezone");

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

      // Wait for username and password fields to be visible
      await page.waitForSelector("#UserName", { visible: true });
      await page.waitForSelector("#Password", { visible: true });

      // Enter username
      await page.focus("#UserName");
      await page.keyboard.type(account.username, { delay: 20 });

      // Enter password using evaluate
      await page.evaluate((pwd) => {
        document.querySelector("#Password").value = pwd;
      }, account.password);
      
      // Tiny wait to ensure JS detects input
      await new Promise(resolve => setTimeout(resolve, 100));

      // Click login and wait for navigation
      await Promise.all([
        page.click("#LoginButton"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      console.log(`${account.username}: Login successful.`);

      await page.screenshot({ path: `${account.username}.png` });
    } catch (err) {
      console.error(`${account.username}: Login failed.`, err);
    } finally {
      await browser.close();
    }
  }
})();
