const { chromium } = require('playwright');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================
const VOTES_PER_DAY = 100;
const RANDOMIZE_INTERVALS = true;
const FIXED_INTERVAL_MINUTES = 15;

// Proxy configuration (leave empty to disable)
// Format: http://username:password@host:port
// Or set via environment variable: PROXY_URL
const PROXY_URL = process.env.PROXY_URL || '';

// List of proxies for rotation (optional - if set, will rotate through these)
// Format: ['http://user:pass@host1:port', 'http://user:pass@host2:port']
const PROXY_LIST = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [];
// ============================================================

const VOTE_URL = 'https://10best.usatoday.com/awards/wild-center-tupper-lake-new-york/';
const MINUTES_PER_DAY = 24 * 60;
const AVG_INTERVAL_MINUTES = MINUTES_PER_DAY / VOTES_PER_DAY;

// Stats for local running
let stats = {
  successful: 0,
  failed: 0,
  rateLimited: 0,
  startTime: null,
  intervals: [],
  proxyIndex: 0,
};

function getCurrentProxy() {
  // If we have a proxy list, return current proxy (don't rotate yet)
  if (PROXY_LIST.length > 0) {
    return PROXY_LIST[stats.proxyIndex % PROXY_LIST.length];
  }
  // Otherwise use single proxy URL if set
  return PROXY_URL || null;
}

function rotateProxy() {
  // Move to next proxy in the list
  if (PROXY_LIST.length > 0) {
    stats.proxyIndex++;
    const newProxy = PROXY_LIST[stats.proxyIndex % PROXY_LIST.length];
    console.log(`  🔄 Rotating to proxy #${(stats.proxyIndex % PROXY_LIST.length) + 1}: ${newProxy.replace(/\/\/.*:.*@/, '//***:***@')}`);
    return true;
  }
  return false;
}

function getChromePath() {
  if (process.env.HEADLESS === 'true') {
    return undefined;
  }
  return path.join(
    __dirname,
    'node_modules',
    'playwright-core',
    '.local-browsers',
    'chromium-1208',
    'chrome-mac-arm64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing'
  );
}

function getNextInterval() {
  if (!RANDOMIZE_INTERVALS) {
    return FIXED_INTERVAL_MINUTES * 60 * 1000;
  }
  const minInterval = AVG_INTERVAL_MINUTES * 0.05;
  const maxInterval = AVG_INTERVAL_MINUTES * 0.15;
  const randomMinutes = minInterval + (Math.random() * (maxInterval - minInterval));
  stats.intervals.push(randomMinutes);
  return Math.round(randomMinutes * 60 * 1000);
}

function formatInterval(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function getRuntime() {
  const diff = Date.now() - stats.startTime;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function printStats() {
  const total = stats.successful + stats.failed + stats.rateLimited;
  const successRate = total > 0 ? ((stats.successful / total) * 100).toFixed(1) : 0;
  const runtime = stats.startTime ? getRuntime() : '0s';
  const runtimeMs = Date.now() - stats.startTime;
  const runtimeHours = runtimeMs / (1000 * 60 * 60);
  const projectedPerDay = runtimeHours > 0 ? Math.round((stats.successful / runtimeHours) * 24) : 0;
  
  console.log(`  📊 Stats: ${stats.successful} successful, ${stats.rateLimited} rate-limited, ${stats.failed} failed (${successRate}% success rate)`);
  console.log(`  📈 Projected: ~${projectedPerDay} votes/day`);
  console.log(`  ⏱️  Running for: ${runtime}`);
}

async function vote() {
  const timestamp = new Date().toLocaleString();
  const attemptNumber = stats.successful + stats.failed + 1;
  console.log(`\n[${timestamp}] Vote attempt #${attemptNumber}...`);
  
  let browser;
  try {
    const isHeadless = process.env.HEADLESS === 'true';
    const chromePath = getChromePath();
    const proxy = getCurrentProxy();
    
    const launchOptions = { headless: isHeadless };
    if (chromePath) launchOptions.executablePath = chromePath;
    
    // Parse proxy URL for authentication
    let proxyConfig = null;
    if (proxy) {
      const proxyMatch = proxy.match(/^(https?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/);
      if (proxyMatch) {
        const [, protocol, username, password, host, port] = proxyMatch;
        proxyConfig = {
          server: `${protocol}://${host}:${port}`,
          username: username || undefined,
          password: password || undefined,
        };
        const proxyNum = PROXY_LIST.length > 0 ? `#${(stats.proxyIndex % PROXY_LIST.length) + 1}` : '';
        console.log(`  Using proxy ${proxyNum}: ${host}:${port}`);
      } else {
        launchOptions.proxy = { server: proxy };
        console.log(`  Using proxy: ${proxy.replace(/\/\/.*:.*@/, '//***:***@')}`);
      }
    }
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('  Navigating to voting page...');
    await page.goto(VOTE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('  Waiting for Vote Now button...');
    
    // Wait for page to fully load and reCAPTCHA to initialize
    await page.waitForTimeout(5000);
    
    // Find and click the Vote Now button
    const voteButton = await page.locator('button:has-text("Vote Now"), button:has-text("VOTE NOW")').first();
    await voteButton.waitFor({ state: 'visible', timeout: 15000 });
    
    // Check if button is enabled, wait if not
    const isDisabled = await voteButton.isDisabled();
    if (isDisabled) {
      console.log('  Button is disabled, waiting for reCAPTCHA...');
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.toLowerCase().includes('vote') && !btn.disabled) {
            return true;
          }
        }
        return false;
      }, { timeout: 20000 });
    }
    
    console.log('  Clicking Vote Now button...');
    await voteButton.click();
    
    // Wait for vote to process
    console.log('  Waiting for vote to process...');
    await page.waitForTimeout(5000);
    
    // Check for rate limit message
    const pageContent = await page.content();
    const rateLimitMessage = await page.locator('text=/reached capacity|already voted|limit/i').first();
    const hasRateLimit = await rateLimitMessage.isVisible().catch(() => false);
    
    if (hasRateLimit || pageContent.includes('reached capacity')) {
      stats.rateLimited++;
      console.log(`  ⚠️  Rate limited - already voted from this IP today`);
      
      // Rotate to next proxy if available
      const rotated = rotateProxy();
      if (!rotated && PROXY_LIST.length === 0 && !PROXY_URL) {
        console.log(`  💡 Tip: Add proxies to vote more than once per day`);
      }
      
      printStats();
      await browser.close();
      return { success: false, rateLimited: true };
    }
    
    stats.successful++;
    console.log(`  ✅ Vote submitted successfully!`);
    printStats();
    
    await browser.close();
    return { success: true, rateLimited: false };
  } catch (error) {
    stats.failed++;
    console.error(`  ❌ Error during voting: ${error.message}`);
    printStats();
    if (browser) await browser.close();
    return { success: false, rateLimited: false, error: error.message };
  }
}

// Export for Cloud Run server
module.exports = { vote };

// Run locally if executed directly
if (require.main === module) {
  async function scheduleNextVote() {
    const intervalMs = getNextInterval();
    console.log(`\n⏰ Next vote in ${formatInterval(intervalMs)}...`);
    setTimeout(async () => {
      await vote();
      scheduleNextVote();
    }, intervalMs);
  }

  async function main() {
    const runOnce = process.argv.includes('--once');
    const votesArg = process.argv.find(arg => arg.startsWith('--votes='));
    const votesPerDay = votesArg ? parseInt(votesArg.split('=')[1], 10) : VOTES_PER_DAY;
    const avgIntervalMin = MINUTES_PER_DAY / votesPerDay;
    
    stats.startTime = Date.now();
    
    console.log('='.repeat(50));
    console.log('🗳️  Wild Center Voter - USA TODAY 10BEST');
    console.log('='.repeat(50));
    console.log(`URL: ${VOTE_URL}`);
    console.log(`Target: ${votesPerDay} votes per day`);
    console.log(`Average interval: ${avgIntervalMin.toFixed(1)} minutes`);
    if (PROXY_LIST.length > 0) {
      console.log(`Proxies: ${PROXY_LIST.length} proxies (rotates on rate limit)`);
    } else if (PROXY_URL) {
      console.log(`Proxy: Single proxy configured`);
    } else {
      console.log(`Proxy: None (using direct connection)`);
    }
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log('='.repeat(50));
    
    if (runOnce) {
      await vote();
      process.exit(0);
    }
    
    await vote();
    console.log('   Press Ctrl+C to stop the voter.\n');
    scheduleNextVote();
  }

  process.on('SIGINT', () => {
    const avgInterval = stats.intervals.length > 0 
      ? (stats.intervals.reduce((a, b) => a + b, 0) / stats.intervals.length).toFixed(1) : 0;
    console.log('\n\n' + '='.repeat(50));
    console.log('👋 Voter stopped. Final stats:');
    console.log('='.repeat(50));
    console.log(`   ✅ Successful votes: ${stats.successful}`);
    console.log(`   ⚠️  Rate limited: ${stats.rateLimited}`);
    console.log(`   ❌ Failed votes: ${stats.failed}`);
    console.log(`   ⏱️  Total runtime: ${getRuntime()}`);
    if (stats.intervals.length > 0) console.log(`   📊 Avg interval used: ${avgInterval} minutes`);
    console.log('='.repeat(50));
    process.exit(0);
  });

  main().catch(console.error);
}
