# MOCHA Call Flows & Auth Reference

This document describes how the components in the MOCHA system interact — from user login through message delivery. Each section covers one flow with a text description and a sequence diagram. The final sections cover wire formats, cryptographic details, and key management.

**Actors:**
- **Browser** — the mocha-chat React app running in the user's browser
- **Moat** — the token and identity service (`api.mocha-net.dev`)
- **Relay** — the MoQ Transport relay (`relay.mocha-net.dev`)
- **Google** — Google's OAuth identity provider (SSO only)
- **PP Issuer** — Privacy Pass token issuer (Privacy Pass mode only)

---

## 1. Google SSO Login

When a user clicks "Sign in with Google", the browser obtains a Google ID token via Google Identity Services, then exchanges it with Moat for a session token. The session token is an HMAC-SHA256 signed `{user_id}:{timestamp}` payload (base64url-encoded) with a 24-hour TTL.

Moat verifies the Google JWT (RS256, checks `aud`, `iss`, expiry), upserts the user in Postgres, and returns the session token. This token is used for all subsequent authenticated Moat API calls (room creation, invite management, CAT token minting).

```
Browser                        Google                         Moat
  |                              |                              |
  |-- Load GIS SDK ------------->|                              |
  |<-- Google Sign-In button ----|                              |
  |                              |                              |
  |   [User clicks Sign In]      |                              |
  |-- OAuth consent flow ------->|                              |
  |<-- Google ID Token (JWT) ----|                              |
  |                              |                              |
  |-- POST /v1/auth/google ------|----->                        |
  |   Authorization: Bearer {google_id_token}                   |
  |                              |     Verify JWT (RS256)       |
  |                              |     Check aud, iss, exp      |
  |                              |     Upsert user in Postgres  |
  |                              |     Sign session token (HMAC)|
  |<----- { session_token, user_id, display_name } -------------|
  |                              |                              |
  | Store session_token          |                              |
  | in CatTokenProvider          |                              |
```

**Files involved:**
- `apps/chat/src/components/login/LoginScreen.tsx` — renders Google button, gets ID token
- `apps/chat/src/stores/auth-store.ts` — dispatches `loginWithGoogle(idToken)`
- `packages/protocol/src/auth/cat-provider.ts` — `loginGoogle()` calls Moat, stores session token
- `moat/src/routes/auth.rs` — `google_login()` verifies JWT, creates session token
- `moat/src/idp/google.rs` — fetches Google public keys, validates RS256 JWT

---

## 2. Guest Login

Guest login creates a server-side user record with provider `"guest"` and a valid session token. Guests can access public rooms but are rejected from authenticated and private rooms.

```
Browser                                                    Moat
  |                                                          |
  |   [User enters name, clicks "Join as Guest"]             |
  |                                                          |
  |-- POST /v1/auth/guest ----->                             |
  |   { "display_name": "Alice" }                            |
  |                              Generate guest identity     |
  |                              (guest-xxxx@moat.local)     |
  |                              Upsert user in Postgres     |
  |                              Sign session token (HMAC)   |
  |<----- { session_token, user_id, display_name } ----------|
  |                                                          |
  | Store session_token                                      |
  | in CatTokenProvider                                      |
```

**Files involved:**
- `apps/chat/src/stores/auth-store.ts` — `loginAsGuest()` dispatches to provider
- `packages/protocol/src/auth/cat-provider.ts` — `loginGuest()` calls Moat
- `moat/src/routes/auth.rs` — `guest_login()` creates identity, signs session token

---

## 3. Room Creation

After login, the user can create rooms. The session token from login is sent as a Bearer token. Moat validates the session token, creates the room in Postgres, and adds the creator as an Admin member.

```
Browser                                                    Moat
  |                                                          |
  |   [User clicks "Create Channel", enters name]            |
  |                                                          |
  |-- POST /v1/rooms ---------->                             |
  |   Authorization: Bearer {session_token}                  |
  |   { "name": "general",                                   |
  |     "namespace_prefix": "mocha_v1/mocha-net.dev/...",    |
  |     "visibility": "public" }                             |
  |                              Verify session token (HMAC) |
  |                              Extract user_id             |
  |                              Insert room in Postgres     |
  |                              Add creator as Admin member |
  |<----- { id, name, namespace_prefix, visibility } --------|
  |                                                          |
```

**Files involved:**
- `apps/chat/src/components/chat/ChannelList.tsx` — `handleCreateRoom()` sends POST
- `moat/src/routes/auth.rs` — `AuthUser` extractor validates Bearer token
- `moat/src/routes/rooms.rs` — `create_room()` inserts room, adds admin membership

---

## 4. CAT Token Minting

When the user joins a channel, the app requests a CAT (Common Access Token) from Moat. The CAT is a COSE_Sign1 structure (CBOR-encoded, ES256-signed) containing CWT claims and MoQT authorization scopes. The scopes define which namespaces the user can publish to and subscribe from on the relay.

Moat checks the room's visibility rules, enforces membership for private rooms, and mints a scoped token. The CAT is refreshed every 30 seconds by the client.

```
Browser                                                    Moat
  |                                                          |
  |   [User joins a channel]                                 |
  |                                                          |
  |-- POST /v1/token ---------->                             |
  |   Authorization: Bearer {session_token}                  |
  |   { "room_id": "...",                                    |
  |     "role": "publisher",                                 |
  |     "token_type": 6501485 }   (0x63346d = "c4m")         |
  |                              Verify session token        |
  |                              Look up room                |
  |                              Check visibility rules:     |
  |                                public: auto-join as Admin|
  |                                authenticated: reject     |
  |                                  guests                  |
  |                                private: reject           |
  |                                  non-members             |
  |                              Build MoQT scopes:          |
  |                                publish: [2,6] on prefix  |
  |                                subscribe: [3,4,7] on     |
  |                                  prefix                  |
  |                              Sign COSE_Sign1 (ES256)     |
  |<----- { token, expires_at, scopes } ---------------------|
  |                                                          |
  | Cache token                                              |
  | Start 30s refresh interval                               |
```

**CAT token structure:**
```
COSE_Sign1 {
  CWT Claims:
    iss: "https://api.mocha-net.dev"
    aud: "moq-relay"
    sub: "user@email.com"
    exp: <unix timestamp>
    iat: <unix timestamp>
  MoQT Scopes (claim 65000):
    [0]   ClientSetup
    [2,6] Publish on namespace prefix
    [3,4,7] Subscribe on namespace prefix
}
```

**Files involved:**
- `packages/protocol/src/auth/cat-provider.ts` — `getToken()` calls Moat, caches result
- `moat/src/routes/token.rs` — `mint_token()` enforces access rules, delegates to minter
- `moat/src/token/c4m.rs` — `C4mMinter.mint()` builds COSE_Sign1 with scopes

---

## 5. MoQ Transport Connection

After obtaining a CAT token, the app establishes a WebTransport (HTTP/3 + QUIC) session to the relay. The CAT token is included in the MoQT CLIENT_SETUP message. The relay verifies the token signature and scopes before allowing the session.

```
Browser                                                    Relay
  |                                                          |
  |== WebTransport CONNECT ===>                              |
  |   wss://relay.mocha-net.dev                              |
  |<== WebTransport session established ====================>|
  |                                                          |
  |-- MOQT CLIENT_SETUP ------->                             |
  |   role: publisher+subscriber                             |
  |   auth_token: {CAT}                                      |
  |   auth_token_type: 0x63346d                              |
  |                              Decode COSE_Sign1           |
  |                              Verify ES256 signature      |
  |                              Check exp, iss, aud         |
  |                              Extract MoQT scopes         |
  |<-- MOQT SERVER_SETUP -------|                            |
  |   role: publisher+subscriber                             |
  |                                                          |
  | Session ready                                            |
```

**Files involved:**
- `packages/protocol/src/session/mocha-session.ts` — `connect()` creates transport, sets auth, calls `setup()`
- `apps/chat/src/stores/connection-store.ts` — orchestrates session creation

---

## 6. Channel Join (Publish + Subscribe)

Once the MoQT session is established, joining a channel involves announcing publish tracks and subscribing to namespace prefixes. Each user publishes their own tracks (messages, presence, typing, reactions) and subscribes to the channel's namespace prefix to receive everyone else's tracks.

```
Browser                                                    Relay
  |                                                          |
  |   [Channel activate]                                     |
  |                                                          |
  |   --- PUBLISH (announce tracks) ---                      |
  |-- ANNOUNCE chat/msg_v1_{devId} ---->                     |
  |-- ANNOUNCE avail/availability_v1_{devId} ->              |
  |-- ANNOUNCE chat/typing_v1_{devId} ->                     |
  |-- ANNOUNCE roster/user_{devId} ---->                     |
  |-- ANNOUNCE react/react_v1_{devId} ->                     |
  |                                                          |
  |   --- SUBSCRIBE (receive others) ---                     |
  |-- SUBSCRIBE_NAMESPACE chat/{prefix} ->                   |
  |-- SUBSCRIBE_NAMESPACE roster/{prefix} ->                 |
  |-- SUBSCRIBE_NAMESPACE avail/{prefix} ->                  |
  |-- SUBSCRIBE_NAMESPACE react/{prefix} ->                  |
  |                                                          |
  |   [Relay matches remote publishers]                      |
  |<-- INCOMING_PUBLISH chat/msg_v1_{otherDevId} --|         |
  |-- SUBSCRIBE to that track -->                            |
  |<-- Object stream (CBOR messages) --|                     |
  |                                                          |
```

**Namespace layout:**
```
(mocha_v1, <provider>, <orgId>, <function>, <teamId>, <channelId>, <hClientId>)

Functions: chat, roster, availability, reactions, media, catalog
Track names: msg_v1_<hDevId>, user_<hDevId>, availability_v1_<hDevId>, etc.
```

**Files involved:**
- `packages/protocol/src/channel/channel.ts` — `activate()` publishes tracks, subscribes to prefixes
- `packages/protocol/src/namespace.ts` — `MochaNamespace` builds 7-tuple namespace paths

---

## 7. Message Send & Receive

Messages are CBOR-encoded and sent as MoQT objects on the user's chat track. Other users receive them via their namespace subscriptions. The relay fans out objects to all subscribers.

```
  Alice (Browser)              Relay                 Bob (Browser)
      |                          |                        |
      | [Types "Hello"]          |                        |
      |                          |                        |
      |-- OBJECT on track ------>|                        |
      |   chat/msg_v1_{aliceDev} |                        |
      |   group: NTP-minute      |                        |
      |   payload: CBOR {        |                        |
      |     type: "text/plain",  |                        |
      |     body: "Hello",       |                        |
      |     sender: {userId,     |                        |
      |       displayName},      |                        |
      |     timestamp: ...,      |                        |
      |     id: {group, object}  |                        |
      |   }                      |                        |
      |                          |-- OBJECT fan-out ----->|
      |                          |   (same payload)       |
      |                          |                        |
      |                          |        Decode CBOR     |
      |                          |        Emit 'message'  |
      |                          |        Render in UI    |
```

Messages also support: replies (via `replyTo` field), edits (same group+object, `edited: true`), deletes (empty body, `deleted: true`), and file attachments (binary data inline in CBOR).

**Files involved:**
- `packages/protocol/src/channel/channel.ts` — `prepareMessage()`, `flushMessage()`, `handleMessage()`
- `packages/protocol/src/codec.ts` — CBOR encode/decode with JSON fallback
- `apps/chat/src/stores/channel-store.ts` — `addMessage()`, localStorage persistence

---

## 8. Privacy Pass Token Flow (Alternative to CAT)

Privacy Pass provides **unlinkable tokens** — the issuer cannot correlate token issuance with token redemption, giving the user stronger privacy guarantees. The flow involves a 3-step cryptographic protocol with a blind signature scheme.

Two token types are supported:
- **Blind RSA (0x0002)** — fully anonymous, no metadata
- **Partially Blind RSA (0xda7a)** — carries namespace scope extensions while maintaining unlinkability

```
Browser                        Moat                       PP Issuer
  |                              |                            |
  | 1. Get challenge             |                            |
  |-- POST /v1/auth/privacypass  |                            |
  |   /challenge --------------->|                            |
  |   { room_id, token_type }    |                            |
  |                              | Build TokenChallenge       |
  |                              |   (per RFC 9578)           |
  |                              |-- GET /.well-known/ ------>|
  |                              |   private-token-issuer-    |
  |                              |   directory                |
  |                              |<-- { issuer public key } --|
  |<-- { token_challenge,        |                            |
  |      issuer_key,             |                            |
  |      extensions? } ----------|                            |
  |                              |                            |
  | 2. Blind & request token     |                            |
  | Client-side: create blinded  |                            |
  |   token request using        |                            |
  |   @cloudflare/privacypass-ts |                            |
  |                              |                            |
  |-- POST /v1/auth/privacypass  |                            |
  |   /token-request ----------->|                            |
  |   (blinded token request)    |-- Proxy request ---------->|
  |                              |   (signs with Ed25519      |
  |                              |    if attester key set)    |
  |                              |<-- Blinded response -------|
  |<-- (blinded token response) -|                            |
  |                              |                            |
  | 3. Finalize token            |                            |
  | Client-side: unblind the     |                            |
  |   issuer's response to get   |                            |
  |   a valid token that the     |                            |
  |   issuer can verify but      |                            |
  |   cannot link to issuance    |                            |
  |                              |                            |
  | Token ready (TTL: 5 min)     |                            |
```

**Key difference from CAT:** The relay verifies Privacy Pass tokens using the issuer's public key. The token proves "some authorized user" without revealing *which* user — the blind signature breaks the link between the issuance request (where Moat knows who you are) and the token redemption (where the relay sees the token).

**Files involved:**
- `packages/protocol/src/auth/privacypass-provider.ts` — `getToken()` implements the 3-step flow
- `moat/src/routes/privacypass.rs` — challenge generation, token request proxying
- External: `@cloudflare/privacypass-ts` — Blind RSA / PBRS client library

---

## End-to-End: Login through First Message

Putting it all together — what happens from the moment a user opens the app to sending their first message:

```
Browser                  Google           Moat                Relay
  |                        |                |                   |
  | 1. SSO LOGIN           |                |                   |
  |-- OAuth flow --------->|                |                   |
  |<-- ID Token -----------|                |                   |
  |-- POST /auth/google ---|--------------->|                   |
  |<-- session_token ------|----------------|                   |
  |                        |                |                   |
  | 2. FETCH ROOMS         |                |                   |
  |-- GET /v1/rooms -------|--------------->|                   |
  |<-- [room list] --------|----------------|                   |
  |                        |                |                   |
  | 3. MINT CAT TOKEN      |                |                   |
  |-- POST /v1/token ------|--------------->|                   |
  |   (session_token +     |                |                   |
  |    room_id)            |   Verify auth  |                   |
  |                        |   Check access |                   |
  |                        |   Mint C4M     |                   |
  |<-- { CAT token } ------|----------------|                   |
  |                        |                |                   |
  | 4. CONNECT TO RELAY    |                |                   |
  |== WebTransport ========|================|==================>|
  |-- CLIENT_SETUP (CAT) --|----------------|------------------>|
  |<-- SERVER_SETUP -------|----------------|-------------------|
  |                        |                |                   |
  | 5. JOIN CHANNEL        |                |                   |
  |-- ANNOUNCE tracks -----|----------------|------------------>|
  |-- SUBSCRIBE_NAMESPACE -|----------------|------------------>|
  |                        |                |                   |
  | 6. SEND MESSAGE        |                |                   |
  |-- OBJECT (CBOR msg) ---|----------------|------------------>|
  |                        |                |    Fan out to     |
  |                        |                |    subscribers    |
```

---

## Auth Token Comparison

| Flow | Identity Model | Token Type | Linkability |
|------|---------------|------------|-------------|
| Guest + C4M | Pseudonymous | ES256 CWT | Linkable to guest ID |
| Google OAuth + C4M | Identified | ES256 CWT | Linkable to Google account |
| Privacy Pass | Anonymous | RSA-PSS blind token | Unlinkable |

---

## Wire Formats

### AUTH_TOKEN Setup Parameter

The AUTH_TOKEN parameter is carried in the MOQT CLIENT_SETUP message as a
setup parameter with type `0x3`:

```
CLIENT_SETUP Message:
+------------------------------------------+
| MOQT Message Type (varint)               |
+------------------------------------------+
| Supported Versions (array)               |
+------------------------------------------+
| Setup Parameters:                        |
|   ...                                    |
|   +------------------------------------+ |
|   | Param Type: 0x03 (AUTH_TOKEN)      | |
|   | Param Length: varint               | |
|   | Param Value:                       | |
|   |   +------------------------------+| |
|   |   | token_type (varint)          || |
|   |   +------------------------------+| |
|   |   | token_value (remaining bytes)|| |
|   |   +------------------------------+| |
|   +------------------------------------+ |
|   ...                                    |
+------------------------------------------+
```

### C4M Token Wire Layout (token_type = 0x63346d)

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|      token_type = 0x63346d (varint, 4 bytes)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|            CWT (CBOR-encoded COSE_Sign1, variable length)      |
|     COSE_Sign1(protected, unprotected, payload, signature)    |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

token_type encoding: 0x63346d = ASCII "c4m"
  varint: 0x80 0xe3 0x8d 0x6d  (4-byte QUIC varint)
```

### Privacy Pass Token Wire Layout (token_type = 0x0002 or 0xda7a)

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  token_type (varint, 1-2 bytes: 0x0002 or 0xda7a)            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         token_type (2 bytes within token body)                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                      nonce (32 bytes)                         |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                challenge_digest (32 bytes)                    |
|              SHA-256(TokenChallenge)                           |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                  token_key_id (32 bytes)                      |
|              SHA-256(issuer_public_key)                        |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                                                               |
|                  authenticator (256 bytes)                    |
|              RSA-PSS-SHA384 signature                          |
|                                                               |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

Total token body: 2 + 32 + 32 + 32 + 256 = 354 bytes
```

### HTTP Message Signature (Moat to PP-Issuer)

Per RFC 9421, Moat signs outbound token-request HTTP messages:

```
HTTP Request:
  POST /token-request HTTP/1.1
  Host: pat.issuer.mocha-net.dev
  Content-Type: application/private-token-request
  Content-Digest: sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:
  Signature-Input: sig1=("@method" "@target-uri" "content-type" \
                         "content-digest");created=1718060400;\
                         alg="ed25519";keyid="moat-attester-key"
  Signature: sig1=:<base64 Ed25519 signature>:
```

---

## Relay Auth Hook Architecture

The relay implements a trait-based plugin system for authentication.
Token type is parsed from the AUTH_TOKEN parameter and dispatched to the
appropriate verifier:

```rust
#[async_trait]
pub trait AuthHook: Send + Sync {
    async fn on_setup(
        &self,
        auth_blob: &[u8],
        session_context: &SessionContext,
    ) -> AuthDecision;
}

pub enum AuthDecision {
    Allow {
        principal: String,
        scope: MoqScope,
    },
    Deny {
        reason: String,
    },
}

pub struct MoqScope {
    pub actions: Vec<MoqAction>,
    pub publish: Vec<NamespacePattern>,
    pub subscribe: Vec<NamespacePattern>,
}
```

Multiple verifiers are registered and dispatched based on `token_type`:

```rust
pub struct MultiVerifier {
    verifiers: HashMap<TokenType, Box<dyn AuthHook>>,
}

impl AuthHook for MultiVerifier {
    async fn on_setup(&self, auth_blob: &[u8], ctx: &SessionContext) -> AuthDecision {
        let token_type = parse_token_type(auth_blob);
        match self.verifiers.get(&token_type) {
            Some(v) => v.on_setup(auth_blob, ctx).await,
            None => AuthDecision::Deny {
                reason: format!("unsupported token type: {:#x}", token_type),
            },
        }
    }
}
```

---

## Cryptographic Summary

| Component | Algorithm | Key Size | Purpose | Who Signs | Who Verifies |
|-----------|-----------|----------|---------|-----------|--------------|
| C4M token | ES256 (ECDSA-P256-SHA256) | 256-bit | MoQ session auth | Moat | Relay |
| Google ID token | RS256 (RSA-PKCS1-SHA256) | 2048-bit | Identity verification | Google | Moat |
| Privacy Pass token | RSA-PSS-SHA384 | 2048-bit | Anonymous auth | PP-Issuer | Relay |
| HTTP message sig | Ed25519 (RFC 9421) | 256-bit | Attester authentication | Moat | PP-Issuer |
| Session tokens | FNV-1a hash | 64-bit | Internal session tracking | Moat | Moat |

### Security Levels

- **ES256**: ~128-bit security (NIST P-256 curve)
- **RSA-2048 PSS-SHA384**: ~112-bit security
- **Ed25519**: ~128-bit security (Curve25519)
- **FNV-1a**: NOT cryptographic; demo-grade only, suitable for non-adversarial session lookup

---

## Key Management and Deployment

### Key Distribution

| Key | Held By | Shared With | Distribution Method |
|-----|---------|-------------|---------------------|
| ES256 private key | Moat | -- | Generated at deploy, never exported |
| ES256 public key | Moat | Relay | Configured via CLI flag or config file |
| RSA-2048 private key | PP-Issuer | -- | Generated at deploy |
| RSA-2048 public key | PP-Issuer | Relay, Moat (via .well-known) | Published at `/.well-known/private-token-issuer-directory` |
| Ed25519 private key | Moat | -- | Generated at deploy |
| Ed25519 public key | Moat | PP-Issuer | Configured via `--attester-key` flag |
| Google JWKS | Google | Moat (fetched) | HTTPS from `googleapis.com/oauth2/v3/certs` |

### Configuration Flags

**Moat:**
- `--es256-key-file` : Path to ES256 private key (PEM)
- `--pp-issuer-url` : PP-Issuer base URL
- `--ed25519-key-file` : Path to Ed25519 signing key
- `--google-client-id` : Google OAuth client ID for token verification

**PP-Issuer:**
- `--rsa-key-file` : Path to RSA-2048 private key (PEM)
- `--attester-key` : Ed25519 public key of Moat (for verifying request signatures)

**Relay:**
- `--es256-pub-key` : ES256 public key for C4M verification
- `--pp-issuer-pub-key` : RSA public key for Privacy Pass verification
- `--auth-required` : Whether AUTH_TOKEN is mandatory (default: true)

---

## Security Considerations

1. **Token Lifetime**: C4M tokens expire after 3600 seconds. Clients must
   refresh before expiry to maintain sessions.

2. **Replay Protection**: Privacy Pass tokens include a redemption_context
   that can be used for single-use enforcement. C4M tokens rely on short
   expiry windows.

3. **Session Token Weakness**: The FNV-1a based session tokens are
   demo-grade and should be replaced with cryptographically random tokens
   (e.g., 256-bit from CSPRNG) for production.

4. **Key Rotation**: The `.well-known/private-token-issuer-directory`
   endpoint supports multiple `token-keys` entries, enabling key rotation
   without downtime.

5. **Scope Granularity**: MoQ scopes use namespace patterns with wildcards.
   The pattern `room/{room_id}/{role}/*` ensures users can only
   publish/subscribe within their authorized rooms and roles.

6. **Privacy Guarantees**: The Privacy Pass flow ensures the relay cannot
   determine _which_ authenticated user is behind a connection. However,
   network-level metadata (IP address, timing) may still allow correlation
   unless additional measures (e.g., proxying) are employed.
