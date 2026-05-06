import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const PHOTO_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_PHOTO_BYTES = 1_500_000;

export async function uploadReportPhoto(file: File, reportId: string) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error('사진은 1.5MB 이하만 업로드할 수 있습니다.');
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 업로드할 수 있습니다.');
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return undefined;
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${new Date().toISOString().slice(0, 10)}/${reportId}.${ext}`;
  const { error } = await supabase.storage.from(env.supabaseBucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const signed = await supabase.storage.from(env.supabaseBucket).createSignedUrl(path, PHOTO_SIGNED_URL_TTL_SECONDS);
  if (signed.error) throw new Error(signed.error.message);
  return signed.data.signedUrl;
}
