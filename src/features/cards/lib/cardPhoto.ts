import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'card-photos';

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads a bike hero photo so scanners of this card's QR can render it.
 * Returns the storage path to embed in the QR payload, or null on failure.
 */
export async function uploadCardPhoto(uid: string, heroDataUrl: string): Promise<string | null> {
  try {
    // getUser can briefly return null while the persisted anonymous session is
    // hydrating on app launch. getSession reads that local session directly.
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? (await supabase.auth.getUser()).data.user;
    if (!user) return null;
    const path = `${user.id}/${uid}.png`;
    const blob = await dataUrlToBlob(heroDataUrl);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/png' });
    if (error) {
      console.error('[cardPhoto] upload failed', error);
      return null;
    }
    return path;
  } catch (err) {
    console.error('[cardPhoto] upload error', err);
    return null;
  }
}

/**
 * Downloads a shared card photo and returns it as a local data URL.
 * Own photos come straight from storage; someone else's shared card photo is
 * fetched through a short-lived signed URL minted by the `card-photo` function,
 * so the bucket itself stays owner-only and cannot be browsed.
 */
export async function fetchCardPhoto(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (!error && data) return await blobToDataUrl(data);

    const { data: signed, error: fnError } = await supabase.functions.invoke('card-photo', {
      body: { path },
    });
    if (fnError || !signed?.url) return null;

    const res = await fetch(signed.url);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch (err) {
    console.error('[cardPhoto] download error', err);
    return null;
  }
}
