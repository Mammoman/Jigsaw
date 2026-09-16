const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));
  page.on('requestfailed', request => console.log('BROWSER_REQUEST_FAILED:', request.url(), request.failure().errorText));

  try {
    await page.goto('http://localhost:3000/play/1234', { waitUntil: 'networkidle0', timeout: 15000 });
  } catch (e) {
    console.log('GOTO_ERROR:', e.message);
  }
  
  await browser.close();
})();
