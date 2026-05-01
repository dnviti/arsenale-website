import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'docs-bundle.json');
const SOURCE_REPO = process.env.ARSENALE_SOURCE_REPO || '/home/debian/repos/arsenale';

const DOCS = [
  {
    key: 'rag-summary',
    localPath: join(SOURCE_REPO, 'docs', 'rag-summary.md'),
    url: 'https://raw.githubusercontent.com/dnviti/arsenale/main/docs/rag-summary.md',
  },
];

async function fetchDocs() {
  console.log('Fetching Arsenale documentation...');

  const results = await Promise.allSettled(
    DOCS.map(async ({ key, localPath, url }) => {
      if (existsSync(localPath)) {
        const text = readFileSync(localPath, 'utf8');
        console.log(`  ✓ ${key} local (${text.length} chars)`);
        return { key, text };
      }

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

fetchDocs()
  .catch((err) => {
    console.error('Fatal error fetching docs:', err);
    process.exit(1);
  });
