const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const moduleCache = new Map();

const moduleFiles = {
  './contentPreferencePolicy': path.join(
    rootDir,
    'src/domain/recommendation/contentPreferencePolicy.ts',
  ),
  './rankingTypes': path.join(rootDir, 'src/domain/recommendation/rankingTypes.ts'),
  './rankVideos': path.join(rootDir, 'src/domain/recommendation/rankVideos.ts'),
};

const loadModule = (specifier) => {
  const filename = moduleFiles[specifier] ?? specifier;

  if (moduleCache.has(filename)) {
    return moduleCache.get(filename).exports;
  }

  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (moduleFiles[request]) {
      return loadModule(request);
    }

    return require(request);
  };

  moduleCache.set(filename, module);
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);

  return module.exports;
};

const { DEFAULT_CONTENT_PREFERENCE_POLICY } = loadModule('./contentPreferencePolicy');
const { rankVideos } = loadModule('./rankVideos');

const now = Date.parse('2026-05-23T00:00:00.000Z');
const baseVideo = {
  createdAt: '2026-05-20T00:00:00.000Z',
  playableInApp: true,
  sourceHealthScore: 0.9,
};

const rankIds = (videos, context = {}) =>
  rankVideos(videos, DEFAULT_CONTENT_PREFERENCE_POLICY, { now, ...context }).map(
    (video) => video.id,
  );

assert.deepEqual(
  rankIds([
    {
      ...baseVideo,
      id: 'ordinary-tv',
      title: '普通电视剧',
      category: '电视剧',
      subCategory: '国产剧',
    },
    {
      ...baseVideo,
      id: 'k-drama',
      title: '浪漫韩剧',
      category: '电视剧',
      subCategory: '韩剧',
      tags: ['韩语'],
    },
  ])[0],
  'k-drama',
  '韩剧同等条件下应该高于普通电视剧',
);

assert.deepEqual(
  rankIds([
    {
      ...baseVideo,
      id: 'movie',
      title: '普通电影',
      category: '电影',
    },
    {
      ...baseVideo,
      id: 'tv',
      title: '普通电视剧',
      category: '电视剧',
    },
  ])[0],
  'tv',
  '电视剧同等条件下应该高于非偏好分类',
);

assert.deepEqual(
  rankIds([
    {
      ...baseVideo,
      id: 'healthy-tv',
      title: '健康普通电视剧',
      category: '电视剧',
      sourceHealthScore: 0.9,
    },
    {
      ...baseVideo,
      id: 'broken-k-drama',
      title: '失效韩剧',
      category: '电视剧',
      subCategory: '韩剧',
      tags: ['韩剧'],
      playableInApp: false,
      sourceHealthScore: 0,
      unsupportedReason: 'source unreachable',
    },
  ])[0],
  'healthy-tv',
  'sourceHealth 很差的视频不能只因为是韩剧就排第一',
);

assert.deepEqual(
  rankIds(
    [
      {
        ...baseVideo,
        id: 'exact-movie',
        title: '寄生兽',
        category: '电影',
      },
      {
        ...baseVideo,
        id: 'preferred-k-drama',
        title: '浪漫韩剧',
        category: '电视剧',
        subCategory: '韩剧',
        tags: ['韩剧'],
      },
    ],
    { searchQuery: '寄生兽' },
  )[0],
  'exact-movie',
  '用户搜索精确命中时相关性应该优先于偏好',
);

console.log('Recommendation ranking tests passed.');
