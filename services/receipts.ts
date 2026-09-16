/**
 * Receipt attachments — web port of mobile services/receipts.ts semantics
 * (docs/SUPABASE.md §2, docs/SECURITY.md): private `receipts` bucket, 4 MiB,
 * image/jpeg|png|webp|heic|heif, owner-scoped `{uid}/…` path (bucket policy:
 * first segment must equal auth.uid()). The DB column stores the raw storage
 * PATH; display resolves a 1-hour signed URL on demand and never persists it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const RECEIPT_BUCKET = "receipts";

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024; // 4 MiB — mirrors the bucket limit

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

const SIGNED_URL_EXPIRY_SECONDS = 3600;

/** Client-side gate before touching the network (fast, clear failure). */
export function validateReceiptFile(file: File): string | null {
  const mime = file.type?.toLowerCase().split(";")[0] ?? "";
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return "Receipts can only be images (JPEG, PNG, WebP or HEIC).";
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return "Receipt image is too large (max 4 MB).";
  }
  return null;
}

// Extension allowlist — the picker-supplied filename is never trusted verbatim.
function sanitizeExtension(file: File): string {
  const raw = file.name?.split(".").pop()?.toLowerCase() ?? "";
  if (raw && ALLOWED_EXTENSIONS.has(raw)) return raw === "jpeg" ? "jpg" : raw;
  const mime = file.type.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "jpg";
}

/** Upload the File to `{uid}/{timestamp}-{rand}.{ext}` and return the raw path
 *  to persist in `expenses.receipt_image_url`. */
export async function uploadReceipt(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<string> {
  const invalid = validateReceiptFile(file);
  if (invalid) throw new Error(invalid);
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${sanitizeExtension(file)}`;
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/**
 * Extract the storage object path from whatever is persisted in
 * `receipt_image_url`. Handles legacy full-URL rows and raw paths; returns
 * null for anything unmanageable (mobile parity).
 *
 * When `userId` is supplied the path's FIRST SEGMENT must equal it — the
 * stored column value is owner-settable over the data plane (and second-order
 * writable by the mobile client), so `..`-stripping is a traversal filter,
 * not an ownership one. Read/delete callers MUST pass the session uid; the
 * uid-prefix guarantee exists in uploadReceipt alone.
 */
export function extractReceiptPath(
  stored: string | null | undefined,
  userId?: string | null,
): string | null {
  if (!stored) return null;
  if (/^(file|content|data|blob):/i.test(stored)) return null;
  let path: string | null = null;
  if (/^https?:\/\//i.test(stored)) {
    const marker = "/object/";
    const idx = stored.indexOf(marker);
    if (idx < 0) return null;
    const rest = stored.slice(idx + marker.length).replace(/^public\//, "");
    const [bucket, ...segments] = rest.split("/");
    if (bucket !== RECEIPT_BUCKET || segments.length === 0) return null;
    const candidate = segments.join("/");
    path = candidate.includes("..") ? null : candidate;
  } else if (stored.includes("/") && !stored.includes("..") && !stored.startsWith("/")) {
    path = stored;
  }
  if (!path) return null;
  if (userId && path.split("/")[0] !== userId) return null;
  return path;
}

/** Resolve the stored value to a displayable URL (signed, 1 h). */
export async function resolveReceiptUrl(
  supabase: SupabaseClient<Database>,
  userId: string | null | undefined,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored || !userId) return null;
  const path = extractReceiptPath(stored, userId);
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // fall through — nothing renderable
  }
  return null;
}

/**
 * Signed URL that forces a download (Content-Disposition: attachment).
 * Audit P2-2: links must never offer TOP-LEVEL navigation to a storage
 * object — a non-image planted via the REST escape hatch would render as a
 * page on the Supabase origin. Downloads are inert by construction.
 */
export async function resolveReceiptDownloadUrl(
  supabase: SupabaseClient<Database>,
  userId: string | null | undefined,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored || !userId) return null;
  const path = extractReceiptPath(stored, userId);
  if (!path) return null;
  const filename = path.split("/").pop() ?? "receipt";
  try {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS, { download: filename });
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // fall through
  }
  return null;
}

/** Best-effort delete of the stored object (replaced/removed receipts). */
export async function deleteReceipt(
  supabase: SupabaseClient<Database>,
  userId: string | null | undefined,
  stored: string | null | undefined,
): Promise<void> {
  const path = extractReceiptPath(stored, userId);
  if (!path || !userId) return;
  try {
    await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
  } catch {
    // object may already be gone — never breaks the caller's flow
  }
}
