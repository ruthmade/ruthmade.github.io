# ruthmade.com

Source code for ruthmade.com - a simple gallery of useful tools for families.

## How it works

The site automatically rebuilds on every push to main:

1. GitHub Action triggers on push
1. Build script fetches all public repos from `ruthmade`
1. Takes screenshots of each tool at its ruthmade.com URL
1. Generates project gallery with screenshots
1. Deploys to GitHub Pages

## Adding new tools

Just create a new repo under `ruthmade` with:

- A `homepage` URL pointing to `https://ruthmade.com/tool-name`
- A `description` field in the repo
- Push to ruthmade.com repo to rebuild

## Local development

```bash
npm install
npm run build
# Open dist/index.html in browser
```

-----

Made with care by [@rubyruth](https://x.com/rubyruth)
