// Product photos uploaded in the admin. They're too big for localStorage, so
// they go in IndexedDB as blobs; products point at them as "idb:<key>".
const DB_NAME = 'bammie';
const STORE = 'images';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const getImage = (key) => run('readonly', (s) => s.get(key));
export const putImage = (key, blob) => run('readwrite', (s) => s.put(blob, key));
export const deleteImage = (key) => run('readwrite', (s) => s.delete(key));
export const clearImages = () => run('readwrite', (s) => s.clear());

const urls = new Map();

// Fill in <img data-idb-src="key"> elements after they've been rendered.
export async function hydrateImages(root = document) {
  for (const img of root.querySelectorAll('img[data-idb-src]')) {
    const key = img.dataset.idbSrc;
    img.removeAttribute('data-idb-src');
    try {
      if (!urls.has(key)) {
        const blob = await getImage(key);
        urls.set(key, blob ? URL.createObjectURL(blob) : null);
      }
      if (urls.get(key)) img.src = urls.get(key);
      else img.remove();
    } catch {
      img.remove();
    }
  }
}

// Shrink an uploaded photo to at most 900px wide (4:3 crop) so it stays small.
export async function compressImage(file, width = 900, height = 675) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp', 0.8);
  // Older Safari can't write WebP and quietly returns PNG; JPEG is smaller then.
  return webp?.type === 'image/webp' ? webp : encode('image/jpeg', 0.82);
}
