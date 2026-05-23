const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

const scanRoots = ['app', 'components', 'features', 'lib', 'scripts', 'src', 'utils', 'docs'];
const ignoredDirectories = new Set(['.expo', '.git', 'dist', 'node_modules', 'video-backend']);
const checkedExtensions = new Set(['.cjs', '.js', '.jsx', '.json', '.md', '.mjs', '.ts', '.tsx']);

const thresholds = {
  appRoute: 80,
  domain: 500,
  featureContainer: 300,
  hook: 200,
  newFile: 800,
  serviceFacade: 400,
};

const allowlist = new Map([
  [
    'app/player/[id].tsx',
    'TODO(Thread 2/player): split into player feature container, episode selector, playback state hook, and recommendation panel.',
  ],
  [
    'app/index.tsx',
    'TODO(Thread 2/home): split into home feature container, category tabs, continue watching rail, and list state hook.',
  ],
  [
    'src/services/videoService.ts',
    'TODO(Thread 5): keep facade-only and remove once callers import src/data/video modules directly.',
  ],
  [
    'src/services/backendApiService.ts',
    'TODO(Thread 5/backend-api): split HTTP client into src/data/api and backend DTO normalizer into src/data/video.',
  ],
  [
    'src/services/webCrawlerService.ts',
    'TODO(Thread 6.6): split crawler config, HTML parser, frontier scheduler, extraction rules, and media resolver.',
  ],
]);

const normalizePath = (value) => value.replace(/\\/g, '/');

const getRelativePath = (filePath) => normalizePath(path.relative(rootDir, filePath));

const shouldSkipDirectory = (directoryPath) => {
  const name = path.basename(directoryPath);

  return ignoredDirectories.has(name);
};

const listFiles = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entryPath)) {
        files.push(...listFiles(entryPath));
      }
      continue;
    }

    if (entry.isFile() && checkedExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
};

const getGitChangedFiles = () => {
  try {
    const output = childProcess.execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=all'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const changed = new Set();
    const added = new Set();

    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const normalized = normalizePath(rawPath.replace(/^"|"$/g, ''));

      if (status === '??' || status.includes('A')) {
        added.add(normalized);
      }

      changed.add(normalized);
    }

    return { added, changed, available: true };
  } catch {
    console.warn('[check:size] git status unavailable; treating threshold violations as blocking.');
    return { added: new Set(), changed: new Set(), available: false };
  }
};

const countLines = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');

  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
};

const isAppRoute = (relativePath) =>
  relativePath.startsWith('app/') && /\.(tsx|ts)$/.test(relativePath);

const isFeatureContainer = (relativePath) =>
  /^(src\/features|features)\//.test(relativePath) &&
  /\.(tsx|ts)$/.test(relativePath) &&
  (relativePath.includes('/screens/') ||
    relativePath.includes('/containers/') ||
    /(?:Screen|Container)\.(tsx|ts)$/.test(relativePath));

const isHook = (relativePath) =>
  /\.(tsx|ts)$/.test(relativePath) &&
  (relativePath.includes('/hooks/') || /\/use[A-Z][^/]*\.(tsx|ts)$/.test(relativePath));

const isServiceFacade = (relativePath) =>
  relativePath.startsWith('src/services/') && /\.(tsx|ts)$/.test(relativePath);

const isDomainFile = (relativePath) =>
  relativePath.startsWith('src/domain/') && /\.(tsx|ts)$/.test(relativePath);

const checkThreshold = ({
  category,
  failures,
  gitStatus,
  lines,
  limit,
  relativePath,
  warnings,
}) => {
  if (lines <= limit || allowlist.has(relativePath)) {
    return;
  }

  const issue = { category, limit, lines, relativePath };

  if (!gitStatus.available || gitStatus.changed.has(relativePath)) {
    failures.push(issue);
    return;
  }

  warnings.push(issue);
};

const files = scanRoots.flatMap((scanRoot) => listFiles(path.join(rootDir, scanRoot)));
const gitStatus = getGitChangedFiles();
const warnings = [];
const failures = [];

for (const filePath of files) {
  const relativePath = getRelativePath(filePath);
  const lines = countLines(filePath);

  if (gitStatus.added.has(relativePath) && lines > thresholds.newFile) {
    failures.push({
      category: 'new-file',
      limit: thresholds.newFile,
      lines,
      relativePath,
    });
  }

  if (isAppRoute(relativePath)) {
    checkThreshold({
      category: 'app-route',
      limit: thresholds.appRoute,
      lines,
      relativePath,
      warnings,
      failures,
      gitStatus,
    });
  }

  if (isFeatureContainer(relativePath)) {
    checkThreshold({
      category: 'feature-container',
      limit: thresholds.featureContainer,
      lines,
      relativePath,
      warnings,
      failures,
      gitStatus,
    });
  }

  if (isHook(relativePath)) {
    checkThreshold({
      category: 'hook',
      limit: thresholds.hook,
      lines,
      relativePath,
      warnings,
      failures,
      gitStatus,
    });
  }

  if (isServiceFacade(relativePath)) {
    checkThreshold({
      category: 'service-facade',
      limit: thresholds.serviceFacade,
      lines,
      relativePath,
      warnings,
      failures,
      gitStatus,
    });
  }

  if (isDomainFile(relativePath)) {
    checkThreshold({
      category: 'domain',
      limit: thresholds.domain,
      lines,
      relativePath,
      warnings,
      failures,
      gitStatus,
    });
  }
}

if (warnings.length > 0) {
  console.warn('[check:size] size warnings:');

  for (const warning of warnings) {
    console.warn(
      `  - ${warning.relativePath}: ${warning.lines} lines > ${warning.limit} (${warning.category})`,
    );
  }
}

if (allowlist.size > 0) {
  console.warn('[check:size] temporary allowlist:');

  for (const [relativePath, reason] of allowlist.entries()) {
    console.warn(`  - ${relativePath}: ${reason}`);
  }
}

if (failures.length > 0) {
  console.error('[check:size] failures:');

  for (const failure of failures) {
    console.error(
      `  - ${failure.relativePath}: ${failure.lines} lines > ${failure.limit} (${failure.category})`,
    );
  }

  process.exitCode = 1;
} else {
  console.log(`[check:size] checked ${files.length} files; no blocking size failures.`);
}
