// NO-OP STUB — created for lib/photo-album-actions.ts dynamic import.
// FLOT does not yet have a chat-photo-markup module. This stub returns the
// input imageUrl unchanged so album avatar actions degrade gracefully.
// Replace with a real implementation that composites (burns) annotations
// into the source image and returns the resulting data URL.
export async function compositePhotoAnnotations(
  imageUrl: string,
  _annotations: unknown[]
): Promise<string> {
  return imageUrl;
}
