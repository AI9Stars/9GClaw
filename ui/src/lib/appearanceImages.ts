import { MAX_BACKGROUND_BYTES, isImageId } from './lightAppearance';

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pilotdeck-appearance', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('imageStorageBlocked'));
  });
}
async function imageTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', mode);
    const req = operation(tx.objectStore('images'));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Image storage failed')); };
  });
}
export async function prepareBackgroundImage(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_BACKGROUND_BYTES) throw new Error('invalidImage');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('invalidImage'); }
  try {
    const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('imageSaveFailed');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // PNG is supported by Electron nativeImage on every platform, unlike WebP.
    // Downscale incompressible photos further so the managed asset stays bounded.
    for (let attempt = 0; attempt < 5; attempt++) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.type !== 'image/png') throw new Error('imageSaveFailed');
      if (blob.size <= MAX_BACKGROUND_BYTES) return blob;
      canvas.width = Math.max(1, Math.round(canvas.width * .75));
      canvas.height = Math.max(1, Math.round(canvas.height * .75));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
    throw new Error('imageSaveFailed');
  } finally { bitmap.close(); }
}
export async function saveBackgroundImage(file: File): Promise<string> {
  const blob = await prepareBackgroundImage(file);
  if (window.pilotdeckDesktop?.saveAppearanceImage) return window.pilotdeckDesktop.saveAppearanceImage(new Uint8Array(await blob.arrayBuffer()));
  const id = `${crypto.randomUUID()}.png`;
  await imageTransaction('readwrite', store => store.put(blob, id));
  return id;
}
export async function loadBackgroundImage(id: string): Promise<string> {
  if (!isImageId(id)) throw new Error('imageMissing');
  if (window.pilotdeckDesktop?.readAppearanceImage) return window.pilotdeckDesktop.readAppearanceImage(id);
  const blob = await imageTransaction('readonly', store => store.get(id));
  if (!(blob instanceof Blob)) throw new Error('imageMissing');
  return URL.createObjectURL(blob);
}
export async function deleteBackgroundImage(id: string): Promise<void> {
  if (!isImageId(id)) return;
  if (window.pilotdeckDesktop?.deleteAppearanceImage) return window.pilotdeckDesktop.deleteAppearanceImage(id);
  await imageTransaction('readwrite', store => store.delete(id));
}
