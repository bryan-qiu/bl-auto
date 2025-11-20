const puppeteer = require("puppeteer");
const moment = require("moment-timezone");

(async () => {
  // Determine current Eastern Time
  const now = moment().tz("America/New_York");

  const isSunday = now.format("dddd") === "Sunday";
  const isMidnight = now.format("HH:mm") === "00:00";

  if (!isSunday || !isMidnight) {
    console.log(`Skipping — current Eastern time is ${now.format()}`);
    process.exit(0);
  }

  console.log(`Running login — current Eastern time is ${now.format()}`);

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

      await page.waitForSelector("#UserName");
      await page.waitForSelector("#Password");

      await page.type("#UserName", account.username, { delay: 20 });
      await page.type("#Password", account.password, { delay: 20 });

      await Promise.all([
        page.click("#LoginButton"),
        page.waitForNavigation({ waitUntil: "networkidle2" })
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
