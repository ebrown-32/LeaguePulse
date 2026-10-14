/** League app icons drawn from their logos: the right size, always opaque, logo kept clear of Android's crop. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderAppIcon } from '../src/lib/appIcon.ts';
import { appIconUrl, hasOwnLogo } from '../src/lib/appIconUrl.ts';

const svg = (fill: string, bg = '') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">${bg ? `<rect width="300" height="200" fill="${bg}"/>` : ''}<circle cx="150" cy="100" r="80" fill="${fill}"/></svg>`);

const pixel = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};

test('icons are square, opaque PNGs at the size asked for', async () => {
  for (const size of [180, 192, 512]) {
    const png = await renderAppIcon(svg('#0a7550'), size, 'any');
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', size, size]);
    assert.equal((await sharp(png).stats()).isOpaque, true, 'iOS turns transparency black');
  }
});

test('a dark logo sits on white, a light logo on near-black', async () => {
  assert.deepEqual(await pixel(await renderAppIcon(svg('#0a7550'), 192, 'any'), 2, 2), [255, 255, 255]);
  assert.deepEqual(await pixel(await renderAppIcon(svg('#ffffff'), 192, 'any'), 2, 2), [18, 20, 23]);
});

test('an opaque logo fills the icon', async () => {
  const png = await renderAppIcon(svg('#ffffff', '#c0392b'), 192, 'any');
  const [r] = await pixel(png, 2, 2);
  assert.ok(r > 150, 'the logo’s own background reaches the corner');
});

test('a maskable icon keeps the logo inside the circle Android crops to', async () => {
  // Corners of the safe zone (radius 40% of the size) stay background.
  const png = await renderAppIcon(svg('#0a7550'), 512, 'maskable');
  assert.deepEqual(await pixel(png, 256 - 150, 256 - 150), [255, 255, 255]);
});

test('icon addresses carry the logo’s version; the default keeps LeaguePulse’s icons', () => {
  assert.equal(hasOwnLogo('/brand/leaguepulse-icon.svg'), false);
  assert.equal(appIconUrl(null, 192), '/brand/leaguepulse-192.png');
  assert.equal(appIconUrl('/brand/leaguepulse-icon.svg', 512, 'maskable'), '/brand/leaguepulse-maskable-512.png');
  const a = appIconUrl('/api/league-logo?v=abc', 180), b = appIconUrl('/api/league-logo?v=abd', 180);
  assert.match(a, /^\/api\/app-icon\?size=180&v=/);
  assert.notEqual(a, b, 'a new logo is a new address, so phones fetch it again');
});
