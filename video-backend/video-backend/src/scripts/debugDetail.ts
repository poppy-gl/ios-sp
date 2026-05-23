const url = 'https://www.wanmeikk.me/video/11105.html';

const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0',
    accept: 'text/html,*/*',
  },
});

const html = await res.text();

console.log('status:', res.status);
console.log('length:', html.length);
console.log('title:', html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim());
console.log('has /play/:', html.includes('/play/'));
console.log('has vod_play_url:', html.includes('vod_play_url'));
console.log('has player:', html.includes('player_'));
console.log('has m3u8:', html.includes('m3u8'));

const playHrefLinks = [...html.matchAll(/href=["']([^"']*\/play\/[^"']+\.html)["']/gi)]
  .slice(0, 30)
  .map((m) => m[1]);

const anyPlayText = [...html.matchAll(/\/play\/[^"'<>\s]+/gi)].slice(0, 30).map((m) => m[0]);

const vodPlayUrl = html.match(/vod_play_url\s*=\s*["']([\s\S]*?)["']/i)?.[1];

console.log('sample href play links:', playHrefLinks);
console.log('sample any /play text:', anyPlayText);
console.log('vod_play_url first 500:', vodPlayUrl?.slice(0, 500));
console.log('first 1000:', html.slice(0, 1000));
