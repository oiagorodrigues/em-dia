// Creates apps/api/.env for local development so sessions and invite codes survive API restarts.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = "apps/api/.env";
if (existsSync(target)) {
  console.log(`${target} already exists, leaving it as is`);
} else {
  const secret = randomBytes(48).toString("base64url");
  const env = readFileSync("apps/api/.env.example", "utf8").replace(
    /^JWT_SECRET=.*$/m,
    `JWT_SECRET=${secret}`,
  );
  writeFileSync(target, env);
  console.log(`created ${target}`);
}
