const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

const GITHUB_USERNAME = 'ruthmade';

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

    // Filter for public repos with homepages (actual tools)
    // Exclude the main ruthmade.com repo itself
    const filtered = repos.filter(function (repo) {
        return !repo.private &&
            repo.homepage &&
            repo.homepage.includes('ruthmade.com') &&
            repo.name !== 'ruthmade.com' &&
            !repo.fork;
    });

    filtered.sort(function (a, b) {
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
    } catch (error) {
        console.error('Failed to screenshot ' + url + ':', error.message);
    } finally {
        await browser.close();
    }

}

function generateProjectHTML(repo, screenshotFilename) {
    const titleWords = repo.name.split('-');
    const title = titleWords.map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    const description = repo.description || 'A useful tool for families.';
    const url = repo.homepage;

    return '\n        <a href="' + url + '" class="project-card" target="_blank" rel="noopener">' +
        '\n            <img src="' + screenshotFilename + '" alt="' + title + '" class="project-screenshot">' +
        '\n            <div class="project-info">' +
        '\n                <div class="project-title">' + title + '</div>' +
        '\n                <div class="project-description">' + description + '</div>' +
        '\n            </div>' +
        '\n        </a>';

}

async function build() {
    console.log('Starting build…');

    const distDir = path.join(__dirname, 'dist');
    await fs.mkdir(distDir, { recursive: true });

    const repos = await fetchRepos();
    console.log('Found ' + repos.length + ' project(s)');

    const projectsHTML = [];

    for (let i = 0; i < repos.length; i++) {
        const repo = repos[i];
        const screenshotFilename = repo.name + '.jpg';
        const screenshotPath = path.join(distDir, screenshotFilename);

        try {
            await takeScreenshot(repo.homepage, screenshotPath);
            projectsHTML.push(generateProjectHTML(repo, screenshotFilename));
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

    console.log('Build complete!');

}

build().catch(function (error) {
    console.error('Build failed:', error);
    process.exit(1);
});
