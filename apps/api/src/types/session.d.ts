// Session shape stored server-side (express-session + connect-pg-simple).
// Augments SessionData so req.session.userId etc. are typed across the app.
import "express-session";

declare module "express-session" {
  interface SessionData {
    /** Discord user id of the authenticated member. Presence = logged in. */
    userId?: string;
    /** Anti-CSRF state for the in-flight Discord OAuth round-trip. */
    oauthState?: string;
    /** PKCE code verifier for the in-flight Discord OAuth round-trip. */
    codeVerifier?: string;
    /** Epoch ms the session was created at login — enforces the absolute cap. */
    createdAt?: number;
  }
}
