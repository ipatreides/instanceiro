import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  console.log('Opening Facebook Developers...');
  await page.goto('https://developers.facebook.com/apps/creation/');
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log('URL:', url);

  // Take screenshot to see current state
  await page.screenshot({ path: 'D:/rag/instance-tracker/scripts/fb-step1.png' });
  console.log('Screenshot saved to scripts/fb-step1.png');
  console.log('Check if logged in or need to login first.');

  await page.close();
}

main().catch(console.error);
