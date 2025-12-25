/**
 * OAuth2 Token Response
 */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Cached Token with expiry
 */
export interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}
