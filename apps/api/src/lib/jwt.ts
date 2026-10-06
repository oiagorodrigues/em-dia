import type { Role } from "@emdia/shared";
import { errors, jwtVerify, SignJWT } from "jose";
import { AppError } from "./errors.ts";

const ISSUER = "emdia-api";
const AUDIENCE = "emdia-web";
const ACCESS_TTL_SECONDS = 15 * 60;

export interface AccessClaims {
  sub: string;
  role: Role;
  tv: number;
}

export interface AccessTokens {
  sign(claims: AccessClaims): Promise<string>;
  /** Throws AppError TOKEN_EXPIRED or UNAUTHENTICATED. */
  verify(token: string): Promise<AccessClaims>;
}

export function createAccessTokens(secret: string, clock: () => Date): AccessTokens {
  const key = new TextEncoder().encode(secret);
  return {
    async sign({ sub, role, tv }) {
      const iat = Math.floor(clock().getTime() / 1000);
      return new SignJWT({ role, tv })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(iat)
        .setExpirationTime(iat + ACCESS_TTL_SECONDS)
        .sign(key);
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ["HS256"],
          requiredClaims: ["sub", "exp", "iat"],
          currentDate: clock(),
        });
        const { sub, role, tv } = payload;
        if (
          typeof sub !== "string" ||
          (role !== "employer" && role !== "worker") ||
          typeof tv !== "number"
        ) {
          throw new AppError("UNAUTHENTICATED", "Sessão inválida");
        }
        return { sub, role, tv };
      } catch (err) {
        if (err instanceof errors.JWTExpired)
          throw new AppError("TOKEN_EXPIRED", "Sessão expirada");
        if (err instanceof AppError) throw err;
        throw new AppError("UNAUTHENTICATED", "Sessão inválida");
      }
    },
  };
}
