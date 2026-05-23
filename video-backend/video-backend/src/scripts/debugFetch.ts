const url = 'https://www.wanmeikk.me/type/hanju.html';

const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0',
    accept: 'text/html,*/*',
  },
});

const html = await res.text();

console.log('status:', res.status);
console.log('length:', html.length);
console.log('has /video/:', html.includes('/video/'));
console.log('has /play/:', html.includes('/play/'));
console.log('has vod:', html.toLowerCase().includes('vod'));
console.log('title match:', html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim());
console.log('first 500:', html.slice(0, 500));

const videoLinks = [...html.matchAll(/href=["']([^"']*\/video\/[^"']+\.html)["']/gi)]
  .slice(0, 10)
  .map((m) => m[1]);

const playLinks = [...html.matchAll(/href=["']([^"']*\/play\/[^"']+\.html)["']/gi)]
  .slice(0, 10)
  .map((m) => m[1]);

console.log('sample video links:', videoLinks);
console.log('sample play links:', playLinks);
