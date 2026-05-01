import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_REPO = process.env.ARSENALE_SOURCE_REPO || '/home/debian/repos/arsenale';
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'project-info.json');

function readText(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function cleanVersion(value) {
  return String(value || '').replace(/^[~^]/, '');
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: SOURCE_REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function parseGoVersion(goMod) {
  const match = goMod.match(/^go\s+([^\s]+)$/m);
  return match ? match[1] : '';
}

function parseLatestRelease(changelog) {
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\](?: - ([^\n]+))?$/gm)];
  const latest = headings.find((match) => match[1] !== 'Unreleased');

  if (!latest) {
    return { version: '', date: '', sections: {}, highlights: [] };
  }

  const start = latest.index + latest[0].length;
  const next = headings.find((match) => (match.index ?? 0) > (latest.index ?? 0));
  const end = next?.index ?? changelog.length;
  const body = changelog.slice(start, end).trim();
  const sectionHeadings = [...body.matchAll(/^### ([^\n]+)$/gm)];
  const sections = {};

  for (let i = 0; i < sectionHeadings.length; i += 1) {
    const heading = sectionHeadings[i];
    const sectionStart = (heading.index ?? 0) + heading[0].length;
    const sectionEnd = sectionHeadings[i + 1]?.index ?? body.length;
    sections[heading[1]] = body
      .slice(sectionStart, sectionEnd)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2));
  }

  const highlights = [
    ...(sections.Added || []),
    ...(sections.Changed || []),
    ...(sections.Fixed || []),
    ...(sections.Security || []),
  ].slice(0, 6);

  return {
    version: latest[1],
    date: latest[2] || '',
    sections,
    highlights,
  };
}

function parseStatusBullets(doc) {
  const match = doc.match(/What is true now:\n\n([\s\S]*?)\n\n## Active Sources Of Truth/);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

function parseCapabilities(yaml) {
  const capabilities = [];
  let current = null;
  let inDependsOn = false;

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const keyMatch = line.match(/^  ([a-z0-9_]+):$/);

    if (keyMatch) {
      if (current) capabilities.push(current);
      current = {
        key: keyMatch[1],
        title: keyMatch[1],
        required: false,
        enabledByDefault: false,
        description: '',
        dependsOn: [],
      };
      inDependsOn = false;
      continue;
    }

    if (!current) continue;

    const attrMatch = line.match(/^    ([A-Za-z0-9_]+):\s*(.*)$/);
    if (attrMatch) {
      const [, key, rawValue] = attrMatch;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();
      inDependsOn = key === 'dependsOn';

      if (key === 'title') current.title = value;
      if (key === 'description') current.description = value;
      if (key === 'required') current.required = value === 'true';
      if (key === 'enabledByDefault') current.enabledByDefault = value === 'true';
      continue;
    }

    const depMatch = line.match(/^      -\s*([a-z0-9_]+)$/);
    if (inDependsOn && depMatch) {
      current.dependsOn.push(depMatch[1]);
    }
  }

  if (current) capabilities.push(current);

  return capabilities.map((capability) => ({
    ...capability,
    state: capability.required
      ? 'required'
      : capability.enabledByDefault
        ? 'enabled'
        : 'optional',
  }));
}

function main() {
  const packagePath = join(SOURCE_REPO, 'package.json');
  if (!existsSync(packagePath)) {
    if (existsSync(OUTPUT_FILE)) {
      console.warn(`[sync-project-info] Source repo not found at ${SOURCE_REPO}; keeping existing ${OUTPUT_FILE}`);
      return;
    }

    throw new Error(`Source repo not found at ${SOURCE_REPO} and no existing ${OUTPUT_FILE} is available`);
  }

  const rootPackage = readJson(packagePath);
  const clientPackage = readJson(join(SOURCE_REPO, 'client', 'package.json'));
  const changelog = readText(join(SOURCE_REPO, 'CHANGELOG.md'));
  const goMod = readText(join(SOURCE_REPO, 'backend', 'go.mod'));
  const goStatus = readText(join(SOURCE_REPO, 'docs', 'go-refactor-handoff.md'));
  const capabilitiesYaml = readText(join(SOURCE_REPO, 'deployment', 'ansible', 'install', 'capabilities.yml'));

  const latestRelease = parseLatestRelease(changelog);
  const version = rootPackage.version;
  const goVersion = parseGoVersion(goMod);

  const data = {
    name: 'Arsenale',
    version,
    releaseTag: `v${version}`,
    releaseDate: latestRelease.date,
    license: rootPackage.license,
    repositoryUrl: rootPackage.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || 'https://github.com/dnviti/arsenale',
    source: {
      revision: git(['rev-parse', '--short', 'HEAD']),
      describe: git(['describe', '--tags', '--always', '--dirty']),
    },
    status: {
      headline: 'Go-first live runtime with installer-owned deployment state',
      points: parseStatusBullets(goStatus),
    },
    latestRelease,
    capabilities: parseCapabilities(capabilitiesYaml),
    deployment: {
      installer: 'Ansible installer via Makefile',
      development: 'Local installer-aware Podman stack with source-built images',
      productionBackends: ['Podman Compose', 'Kubernetes via Helm'],
      dockerInstallerBackend: false,
      statusCommand: 'make status',
    },
    stack: [
      { name: `Go ${goVersion}`, detail: 'split control, broker, query, AI, orchestration, and runtime services' },
      { name: `React ${cleanVersion(clientPackage.dependencies.react)}`, detail: `Vite ${cleanVersion(clientPackage.devDependencies.vite)} SPA with Tailwind CSS ${cleanVersion(clientPackage.dependencies.tailwindcss)}` },
      { name: 'PostgreSQL 16 + Redis 7', detail: 'SQL migrations, audit data, vault state, coordination, rate limits, and ephemeral auth state' },
      { name: 'Guacamole + XTerm.js', detail: 'browser RDP/VNC desktops and SSH terminals' },
      { name: 'Monaco + DB proxy', detail: 'SQL editor, query runner, firewall, masking, audit, and database introspection' },
      { name: 'Ansible + Podman + Helm', detail: 'installer-first deployment and production operations' },
      { name: 'Go CLI + browser extension', detail: 'native-client orchestration and Manifest V3 account/keychain access' },
    ],
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[sync-project-info] Wrote ${OUTPUT_FILE} from ${SOURCE_REPO} (${version})`);
}

main();
