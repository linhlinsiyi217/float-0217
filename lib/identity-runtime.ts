// Minimal identity shim for the drawing subsystem.
// Y2K ships a full multi-identity runtime; FLOT does not need it. This shim
// exposes only getCurrentIdentityId() so the group-drawing round can detect
// an identity switch mid-round and abort with a "please reopen the board" error.
// The id is sourced from FLOT's existing user-identity resolver in settings-storage;
// if none is configured, a stable sentinel is returned.
import { resolveUserIdentity } from "./settings-storage";

export function getCurrentIdentityId(): string {
    return resolveUserIdentity()?.id || "__user__";
}
