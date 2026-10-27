// NO-OP STUB — created for lib/photo-album-actions.ts dynamic import.
// FLOT does not yet have a chat-avatar-action module. This stub returns
// false (no avatar actually set) so album avatar actions are rolled back
// gracefully instead of falsely claiming success.
// Replace with a real implementation that sets the chat session avatar.
export function setAvatarFromSharedAlbum(
  _sessionId: string,
  _characterId: string,
  _avatarDataUrl: string,
  _label: string
): boolean {
  return false;
}
