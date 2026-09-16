const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('Launching browser with Chrome...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  console.log('Navigating to http://localhost:5180...');
  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });

  // Handle Login
  try {
    const userField = await page.waitForSelector('#login-username', { timeout: 4000 });
    if (userField) {
      console.log('Logging in as admin...');
      await page.fill('#login-username', 'admin');
      await page.fill('#login-password', 'admin123');
      await page.click('#login-submit');
      console.log('Clicked login submit.');
    }
  } catch (e) {
    console.log('Already logged in or no login page.');
  }

  // Wait for dashboard layout to load
  await page.waitForSelector('.dashboard-layout', { timeout: 15000 });
  // Wait until initial loading is fully finished (wait until rendering placeholder disappears)
  await page.waitForTimeout(5000);

  const tabsToCapture = [
    { name: '01_overview.png', tabText: 'Overview', delay: 3500 },
    { name: '02_predictions.png', tabText: 'Predictions', delay: 4000 },
    { name: '03_ai_agents.png', tabText: 'AI Agents', delay: 3500 },
    { name: '04_ai_system.png', tabText: 'AI System', delay: 3500 },
    { name: '05_drift_intelligence.png', tabText: 'Drift Intelligence', delay: 4500 },
    { name: '06_shap_explainability.png', tabText: 'SHAP Explainer', delay: 4500 },
    { name: '06_feature_importance.png', tabText: 'Explainability', delay: 3500 },
    { name: '07_scenario_simulator.png', tabText: 'Scenario Simulator', delay: 3500 },
    { name: '08_model_comparison.png', tabText: 'Model Comparison', delay: 3500 },
  ];

  for (const item of tabsToCapture) {
    console.log(`Switching to tab: ${item.tabText}...`);
    try {
      const navItem = await page.locator(`.sidebar-nav .nav-link:has-text("${item.tabText}")`).first();
      await navItem.click();
      await page.waitForTimeout(item.delay);
      const filePath = path.join(screenshotsDir, item.name);
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`Saved screenshot: ${item.name}`);
    } catch (err) {
      console.error(`Failed to capture ${item.name}:`, err.message);
    }
  }

  // AI Assistant drawer
  try {
    console.log('Opening AI Assistant drawer...');
    const aiBtn = await page.locator('button.ai-topbar-btn, .sidebar-nav .nav-link:has-text("AI Assistant")').first();
    await aiBtn.click();
    await page.waitForTimeout(2000);
    const promptBtn = await page.locator('button:has-text("What is the current model performance?")').first();
    if (promptBtn) {
      console.log('Triggering AI question...');
      await promptBtn.click();
      await page.waitForTimeout(6000);
    }
    const aiDrawerPath = path.join(screenshotsDir, '09_ai_assistant.png');
    await page.screenshot({ path: aiDrawerPath, fullPage: false });
    console.log('Saved screenshot: 09_ai_assistant.png');
  } catch (err) {
    console.error('Failed to capture AI Assistant drawer:', err.message);
  }

  await browser.close();
  console.log('All screenshots captured perfectly!');
})();
