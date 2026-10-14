import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:1440,height:800},deviceScaleFactor:1});
 await page.goto(new URL('lineart-board.html',import.meta.url).href);
 await page.evaluate(() => document.fonts.ready);
 await page.screenshot({path:fileURLToPath(new URL('lineart-board.png',import.meta.url)),fullPage:true});
 console.log('LINEART_BOARD_READY');
} finally {await browser.close();}
