// 発行した URL の表示・コピー・QR コード画像の保存
import qrcode from '/vendor/qrcode.mjs';
import { copyText, h, toast } from './ui.js';

export const LINKS = {
  join: {
    path: 'j',
    label: '参加URL',
    desc: 'あみだくじに参加する人（上に名前が並ぶ人）に送ります',
    icon: '🙋',
  },
  choice: {
    path: 'c',
    label: '選択肢追加URL',
    desc: '選択肢を持ち寄る人に送ります。1人1つ選択肢を出し、線も1本引けます',
    icon: '🎁',
  },
  line: {
    path: 'l',
    label: '線追加URL',
    desc: '選択肢は出さずに、線を1本だけ気軽に引いてもらう人に送ります',
    icon: '✏️',
  },
};

/** @param {'host' | keyof typeof LINKS} role */
export function roomUrl(role, id, key) {
  const path = role === 'host' ? 'h' : LINKS[role].path;
  return `${location.origin}/${path}/${id}/${key}`;
}

function qrCanvas(url, { title, label }) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.max(6, Math.floor(480 / n));
  const quiet = cell * 4;
  const size = n * cell + quiet * 2;
  const captionH = 112;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + captionH;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2b2622';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(quiet + c * cell, quiet + r * cell, cell, cell);
    }
  }
  const font = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d9577c';
  ctx.font = `800 34px ${font}`;
  ctx.fillText(label, size / 2, size + 20, size - 32);
  ctx.fillStyle = '#2b2622';
  ctx.font = `700 26px ${font}`;
  ctx.fillText(title, size / 2, size + 62, size - 32);
  ctx.fillStyle = '#8a7f76';
  ctx.font = `400 18px ${font}`;
  ctx.fillText('もちあみ -持ち寄りあみだくじ-', size / 2, size + 94, size - 32);
  return canvas;
}

function download(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) {
      toast('画像を作れませんでした', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, 'image/png');
}

/**
 * URL カード（コピー・共有・QR 表示/保存）
 * @param {{ role: keyof typeof LINKS, id: string, key: string, title: string }} opts
 */
export function shareCard({ role, id, key, title }) {
  const info = LINKS[role];
  const url = roomUrl(role, id, key);
  const qrBox = h('div', { class: 'qr-box', hidden: true });
  let rendered = false;

  const toggleQr = async () => {
    if (!rendered) {
      await document.fonts?.ready;
      const canvas = qrCanvas(url, { title, label: info.label });
      const img = h('img', {
        src: canvas.toDataURL('image/png'),
        alt: `${info.label}のQRコード`,
        width: canvas.width,
        height: canvas.height,
      });
      qrBox.append(
        img,
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => download(canvas, `mochiami-${role}-${id}.png`),
          },
          'QRコードを画像で保存',
        ),
        h('p', { class: 'hint' }, 'スマホでは画像を長押ししても保存できます'),
      );
      rendered = true;
    }
    qrBox.hidden = !qrBox.hidden;
    qrToggle.textContent = qrBox.hidden ? 'QRコード' : 'QRを閉じる';
    qrToggle.setAttribute('aria-expanded', String(!qrBox.hidden));
  };

  const qrToggle = h(
    'button',
    { class: 'btn small', type: 'button', onclick: toggleQr, 'aria-expanded': 'false' },
    'QRコード',
  );
  const canShare = typeof navigator.share === 'function';

  return h(
    'section',
    { class: `share-card share-${role}` },
    h(
      'div',
      { class: 'share-head' },
      h('span', { class: 'share-icon', 'aria-hidden': 'true' }, info.icon),
      h('div', null, h('h3', null, info.label), h('p', { class: 'hint' }, info.desc)),
    ),
    h('input', {
      class: 'url-field',
      type: 'text',
      readonly: true,
      value: url,
      'aria-label': info.label,
      onfocus: (e) => e.target.select(),
    }),
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        { class: 'btn small primary', type: 'button', onclick: () => copyText(url) },
        'コピー',
      ),
      canShare
        ? h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onclick: () =>
                navigator
                  .share({
                    title: `${title}｜${info.label}`,
                    text: `「${title}」${info.label}`,
                    url,
                  })
                  .catch(() => {}),
            },
            '共有',
          )
        : null,
      qrToggle,
    ),
    qrBox,
  );
}
