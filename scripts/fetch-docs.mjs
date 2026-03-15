import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'docs-bundle.json');

const DOCS = [
  { key: 'rag-summary', url: 'https://raw.githubusercontent.com/dnviti/arsenale/main/docs/rag-summary.md' },
];

async function fetchDocs() {
  console.log('Fetching Arsenale documentation from GitHub...');

  const results = await Promise.allSettled(
    DOCS.map(async ({ key, url }) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${key}: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      console.log(`  ✓ ${key} (${text.length} chars)`);
      return { key, text };
    })
  );

  const bundle = {};
  let failures = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      bundle[result.value.key] = result.value.text;
    } else {
      console.error(`  ✗ ${result.reason.message}`);
      failures++;
    }
  }

  if (Object.keys(bundle).length === 0) {
    console.error('No documentation fetched. Aborting.');
    process.exit(1);
  }

  if (failures > 0) {
    console.warn(`Warning: ${failures} document(s) failed to fetch.`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(bundle, null, 2));
  console.log(`\nDocs bundle written to ${OUTPUT_FILE} (${Object.keys(bundle).length} documents)`);
}

async function fetchRelease() {
  console.log('\nFetching latest release from GitHub...');
  try {
    const res = await fetch('https://api.github.com/repos/dnviti/arsenale/releases/latest');
    if (!res.ok) {
      throw new Error(`Failed to fetch release: ${res.status} ${res.statusText}`);
    }
    const release = await res.json();
    const info = {
      version: release.tag_name,
      url: release.html_url,
      date: release.published_at ? release.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
    };
    const outPath = join(OUTPUT_DIR, 'release-info.json');
    writeFileSync(outPath, JSON.stringify(info, null, 2));
    console.log(`  ✓ release ${info.version} (${info.date})`);
    console.log(`Release info written to ${outPath}`);
  } catch (err) {
    console.warn(`  ✗ ${err.message}`);
    // Write fallback so the site can still build
    const fallback = { version: '', url: 'https://github.com/dnviti/arsenale/releases', date: '' };
    const outPath = join(OUTPUT_DIR, 'release-info.json');
    writeFileSync(outPath, JSON.stringify(fallback, null, 2));
    console.warn('Wrote fallback release-info.json');
  }
}

fetchDocs()
  .then(() => fetchRelease())
  .catch((err) => {
    console.error('Fatal error fetching docs:', err);
    process.exit(1);
  });
