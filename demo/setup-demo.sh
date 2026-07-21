# Recreates a pristine demo repo for the recording. Sourced (hidden) by demo.tape.
DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_STRIPE_KEY="sk_""live_""51KgXw9dJ2mPXtR8vQhLcYzn4"
cd "$DEMO_DIR"
rm -rf work && mkdir work && cd work
git init --bare -q origin.git
mkdir acme-api && cd acme-api
git init -q -b main
cat > package.json <<'PKG'
{
  "name": "acme-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "node src/server.js" }
}
PKG
mkdir src
cat > src/stripe-client.js <<'JS'
export default {
  charge(amountCents, apiKey) {
    return { ok: true, amountCents, authorized: Boolean(apiKey) };
  },
};
JS
cat > src/server.js <<'JS'
import http from "node:http";
import { chargeCustomer } from "./payments.js";

const server = http.createServer(async (req, res) => {
  if (req.url === "/charge" && req.method === "POST") {
    const result = await chargeCustomer(await readBody(req));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }
  res.writeHead(404);
  res.end();
});

async function readBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return JSON.parse(data || "{}");
}

server.listen(3000);
JS
cp "$DEMO_DIR/stage/payments-v0.js" src/payments.js
git add -A
git commit -qm "Initial commit"
git remote add origin ../origin.git
git push -qu origin main >/dev/null 2>&1
cd "$DEMO_DIR/work"
clear
