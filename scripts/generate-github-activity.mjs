import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const username = process.env.GITHUB_ACTIVITY_USERNAME ?? 'EP2-Git';
const sourceUrl = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(repositoryRoot, 'assets');

const response = await fetch(sourceUrl, {
  headers: {
    Accept: 'text/html',
    'User-Agent': `${username}-profile-activity-card`,
  },
});

if (!response.ok) {
  throw new Error(`GitHub contribution graph returned ${response.status}`);
}

const html = await response.text();
const stripMarkup = (value) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const headingMatch = html.match(
  /<h2[^>]*id="js-contribution-activity-description"[^>]*>([\s\S]*?)<\/h2>/,
);
const heading = headingMatch ? stripMarkup(headingMatch[1]) : '';
const headingTotalMatch = heading.match(/([\d,]+)\s+contributions?/i);

if (!headingTotalMatch) {
  throw new Error('Could not read the public contribution total from GitHub');
}

const dayPattern =
  /<td(?=[^>]*\bdata-date="([^"]+)")(?=[^>]*\bdata-level="(\d+)")[^>]*>[\s\S]*?<\/td>\s*<tool-tip[^>]*>([\s\S]*?)<\/tool-tip>/g;
const days = [...html.matchAll(dayPattern)]
  .map((match) => {
    const tooltip = stripMarkup(match[3]);
    const countMatch = tooltip.match(/([\d,]+)\s+contributions?\s+on/i);
    return {
      date: match[1],
      level: Number(match[2]),
      count: countMatch ? Number(countMatch[1].replaceAll(',', '')) : 0,
    };
  })
  .sort((left, right) => left.date.localeCompare(right.date));

if (days.length < 350) {
  throw new Error(`Expected a full contribution year; received ${days.length} days`);
}

const total = days.reduce((sum, day) => sum + day.count, 0);
const headingTotal = Number(headingTotalMatch[1].replaceAll(',', ''));
if (total !== headingTotal) {
  throw new Error(`Contribution total mismatch: heading=${headingTotal}, days=${total}`);
}

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const palettes = {
  light: {
    background: '#ffffff',
    border: '#d0d7de',
    text: '#24292f',
    muted: '#57606a',
    accent: '#6857d9',
  },
  dark: {
    background: '#0d1117',
    border: '#30363d',
    text: '#f0f6fc',
    muted: '#8b949e',
    accent: '#b9adff',
  },
};

const render = (theme) => {
  const palette = palettes[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="110" viewBox="0 0 520 110" role="img" aria-labelledby="title description">
  <title id="title">${total.toLocaleString('en-US')} GitHub contributions in the last year</title>
  <desc id="description">Rolling-year contribution total from GitHub's public profile, refreshed daily.</desc>
  <rect x="0.5" y="0.5" width="519" height="109" rx="12" fill="${palette.background}" stroke="${palette.border}"/>
  <rect x="0" y="18" width="3" height="74" rx="1.5" fill="${palette.accent}"/>
  <g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <text x="20" y="27" fill="${palette.accent}" font-size="11" font-weight="700" letter-spacing="1.3">GITHUB ACTIVITY</text>
    <text x="120" y="83" fill="${palette.text}" font-size="48" font-weight="700" text-anchor="end">${escapeXml(total.toLocaleString('en-US'))}</text>
    <text x="138" y="61" fill="${palette.text}" font-size="18" font-weight="600">contributions</text>
    <text x="138" y="82" fill="${palette.muted}" font-size="12">rolling year · updated daily</text>
  </g>
</svg>
`;
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Object.keys(palettes).map((theme) =>
    writeFile(resolve(outputDirectory, `github-activity-${theme}.svg`), render(theme), 'utf8'),
  ),
);

console.log(
  `Generated a rolling-year total of ${total} contributions from ${sourceUrl}`,
);
