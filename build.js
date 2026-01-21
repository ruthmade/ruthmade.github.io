const fs = require(‘fs’).promises;
const path = require(‘path’);
const puppeteer = require(‘puppeteer’);

const GITHUB_USERNAME = ‘ruthmade’;
const SITE_BASE_URL = ‘https://ruthmade.com’;

async function fetchRepos() {
console.log(‘Fetching repositories…’);

const response = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos`, {
    headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ruthmade-site-builder'
    }
});

if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
}

const repos = await response.json();

// Filter for public repos with homepages (actual tools)
// Exclude the main ruthmade.com repo itself
return repos.filter(repo => 
    !repo.private && 
    repo.homepage && 
    repo.homepage.includes('ruthmade.com') &&
    repo.name !== 'ruthmade.com' &&
    !repo.fork
).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

}

async function takeScreenshot(url, outputPath) {
console.log(`Taking screenshot of ${url}...`);

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    // Give it time to load
    await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
    });
    
    // Wait a bit more for any animations
    await page.waitForTimeout(1000);
    
    await page.screenshot({
        path: outputPath,
        type: 'jpeg',
        quality: 85
    });
    
    console.log(`Screenshot saved: ${outputPath}`);
} catch (error) {
    console.error(`Failed to screenshot ${url}:`, error.message);
    // Create a placeholder image if screenshot fails
    // Just copy a default placeholder
} finally {
    await browser.close();
}

}

function generateProjectHTML(repo, screenshotFilename) {
const title = repo.name
.split(’-’)
.map(word => word.charAt(0).toUpperCase() + word.slice(1))
.join(’ ’);

const description = repo.description || 'A useful tool for families.';
const url = repo.homepage;

return `
    <a href="${url}" class="project-card" target="_blank" rel="noopener">
        <img src="${screenshotFilename}" alt="${title}" class="project-screenshot">
        <div class="project-info">
            <div class="project-title">${title}</div>
            <div class="project-description">${description}</div>
        </div>
    </a>`;

}

async function build() {
console.log(‘Starting build…’);

// Create dist directory
const distDir = path.join(__dirname, 'dist');
await fs.mkdir(distDir, { recursive: true });

// Fetch repositories
const repos = await fetchRepos();
console.log(`Found ${repos.length} project(s)`);

// Take screenshots
const projectsHTML = [];
for (const repo of repos) {
    const screenshotFilename = `${repo.name}.jpg`;
    const screenshotPath = path.join(distDir, screenshotFilename);
    
    try {
        await takeScreenshot(repo.homepage, screenshotPath);
        projectsHTML.push(generateProjectHTML(repo, screenshotFilename));
    } catch (error) {
        console.error(`Failed to process ${repo.name}:`, error);
    }
}

// Read template
let html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');

// Insert projects
html = html.replace(
    '<!-- Projects will be inserted here by build script -->',
    projectsHTML.join('\n')
);

// Copy profile picture
try {
    await fs.copyFile(
        path.join(__dirname, 'profile.jpg'),
        path.join(distDir, 'profile.jpg')
    );
} catch (error) {
    console.warn('Profile picture not found, skipping...');
}

// Write final HTML
await fs.writeFile(path.join(distDir, 'index.html'), html);

console.log('Build complete!');

}

build().catch(error => {
console.error(‘Build failed:’, error);
process.exit(1);
});
