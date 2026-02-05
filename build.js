const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

const GITHUB_USERNAME = 'ruthmade';

// Repos to exclude from the site
const EXCLUDED_REPOS = [
    'ruthmade.github.io',
    'obsidian-releases',  // Fork
];

async function fetchRepos() {
    console.log('Fetching repositories…');

    const response = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ruthmade-site-builder'
        }
    });

    if (!response.ok) {
        throw new Error('GitHub API error: ' + response.status);
    }

    const repos = await response.json();

    // Filter for public repos, exclude forks and specific repos
    const filtered = repos.filter(function (repo) {
        return !repo.private &&
            !repo.fork &&
            !EXCLUDED_REPOS.includes(repo.name);
    });

    // Sort: repos with homepages first, then by date
    filtered.sort(function (a, b) {
        // Prioritize repos with ruthmade.com homepages
        const aHasHomepage = a.homepage && a.homepage.includes('ruthmade.com');
        const bHasHomepage = b.homepage && b.homepage.includes('ruthmade.com');
        
        if (aHasHomepage && !bHasHomepage) return -1;
        if (!aHasHomepage && bHasHomepage) return 1;
        
        return new Date(b.created_at) - new Date(a.created_at);
    });

    return filtered;
}

async function takeScreenshot(url, outputPath) {
    console.log('Taking screenshot of ' + url + '…');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800 });

        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        await page.screenshot({
            path: outputPath,
            type: 'jpeg',
            quality: 85
        });

        console.log('Screenshot saved: ' + outputPath);
        return true;
    } catch (error) {
        console.error('Failed to screenshot ' + url + ':', error.message);
        return false;
    } finally {
        await browser.close();
    }
}

function generatePreviewSVG(repo) {
    const title = repo.name;
    const description = repo.description || 'A tool by ruthmade';
    
    // Truncate description if too long
    const maxDescLength = 60;
    const truncatedDesc = description.length > maxDescLength 
        ? description.substring(0, maxDescLength) + '…' 
        : description;
    
    // Extract topics/tags for display
    const topics = repo.topics || [];
    const topicsText = topics.slice(0, 4).join(' • ');

    return `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  
  <!-- Title -->
  <text x="600" y="340" 
        font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" 
        font-size="96" 
        font-weight="700" 
        fill="#ffffff" 
        text-anchor="middle">
    ${title}
  </text>
  
  <!-- Description -->
  <text x="600" y="420" 
        font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" 
        font-size="32" 
        font-weight="400" 
        fill="#8892a0" 
        text-anchor="middle">
    ${truncatedDesc}
  </text>
  
  <!-- Topics -->
  ${topicsText ? `<text x="600" y="480" 
        font-family="ui-monospace, SFMono-Regular, monospace" 
        font-size="22" 
        fill="#6366f1" 
        text-anchor="middle">
    ${topicsText}
  </text>` : ''}
  
  <!-- GitHub icon hint -->
  <text x="600" y="700" 
        font-family="system-ui, sans-serif" 
        font-size="20" 
        fill="#4a5568" 
        text-anchor="middle">
    github.com/ruthmade/${title}
  </text>
</svg>`;
}

async function generatePreviewImage(repo, outputPath) {
    console.log('Generating preview card for ' + repo.name + '…');
    
    const svgPath = outputPath.replace('.jpg', '.svg');
    const svg = generatePreviewSVG(repo);
    
    await fs.writeFile(svgPath, svg);
    
    // Try to convert SVG to JPG using rsvg-convert
    try {
        execSync(`rsvg-convert "${svgPath}" -o "${outputPath}" -w 1200 -h 800 --format jpeg`, {
            stdio: 'pipe'
        });
        console.log('Preview card saved: ' + outputPath);
        
        // Clean up SVG
        await fs.unlink(svgPath);
        return true;
    } catch (error) {
        console.error('rsvg-convert failed, trying puppeteer fallback…');
        
        // Fallback: use puppeteer to render SVG
        try {
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.setViewport({ width: 1200, height: 800 });
            await page.setContent(`<!DOCTYPE html>
                <html><body style="margin:0;padding:0;">
                ${svg}
                </body></html>`);
            
            await page.screenshot({
                path: outputPath,
                type: 'jpeg',
                quality: 90
            });
            
            await browser.close();
            await fs.unlink(svgPath);
            console.log('Preview card saved (via puppeteer): ' + outputPath);
            return true;
        } catch (puppeteerError) {
            console.error('Puppeteer fallback also failed:', puppeteerError.message);
            return false;
        }
    }
}

// Words that should stay ALL CAPS
const PRESERVE_CAPS = ['csv', 'cli', 'api', 'url', 'html', 'css', 'sql', 'ai', 'ui', 'ux'];

function generateProjectHTML(repo, imageFilename, hasWebsite) {
    const titleWords = repo.name.split('-');
    const title = titleWords.map(function (word) {
        if (PRESERVE_CAPS.includes(word.toLowerCase())) {
            return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    const description = repo.description || 'A useful tool.';
    
    // Link to homepage if it exists, otherwise to GitHub repo
    const url = hasWebsite ? repo.homepage : repo.html_url;
    
    // Add a badge for CLI/non-web tools
    const badge = hasWebsite ? '' : '<span class="cli-badge">CLI</span>';

    return `
        <a href="${url}" class="project-card" target="_blank" rel="noopener">
            <img src="${imageFilename}" alt="${title}" class="project-screenshot">
            <div class="project-info">
                <div class="project-title">${title}${badge}</div>
                <div class="project-description">${description}</div>
            </div>
        </a>`;
}

async function build() {
    console.log('Starting build…');

    const distDir = path.join(__dirname, 'dist');
    await fs.mkdir(distDir, { recursive: true });

    const repos = await fetchRepos();
    console.log('Found ' + repos.length + ' repository(ies)');

    const projectsHTML = [];

    for (let i = 0; i < repos.length; i++) {
        const repo = repos[i];
        const imageFilename = repo.name + '.jpg';
        const imagePath = path.join(distDir, imageFilename);
        
        // Take screenshot if repo has any valid homepage URL
        const hasWebsite = repo.homepage && (repo.homepage.startsWith('http://') || repo.homepage.startsWith('https://'));

        try {
            let success = false;
            
            if (hasWebsite) {
                // Take screenshot of the website
                success = await takeScreenshot(repo.homepage, imagePath);
            } else {
                // Generate a preview card
                success = await generatePreviewImage(repo, imagePath);
            }
            
            if (success) {
                projectsHTML.push(generateProjectHTML(repo, imageFilename, hasWebsite));
            }
        } catch (error) {
            console.error('Failed to process ' + repo.name + ':', error);
        }
    }

    let html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');

    html = html.replace(
        '<!-- Projects will be inserted here by build script -->',
        projectsHTML.join('\n')
    );

    try {
        await fs.copyFile(
            path.join(__dirname, 'profile.jpg'),
            path.join(distDir, 'profile.jpg')
        );
    } catch (error) {
        console.warn('Profile picture not found, skipping...');
    }

    await fs.writeFile(path.join(distDir, 'index.html'), html);

    console.log('Build complete! Generated ' + projectsHTML.length + ' project cards.');
}

build().catch(function (error) {
    console.error('Build failed:', error);
    process.exit(1);
});
