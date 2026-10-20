# Ouru Superstores – setup & deploy
Files: server.js, package.json, products.json, public/index.html (shop), public/admin.html (admin), public/img/ (photos)

## Run locally
npm install && ADMIN_KEY=mysecret npm start
Shop: http://localhost:3000   Admin: http://localhost:3000/admin.html

## Admin panel (/admin.html)
Log in with ADMIN_KEY. Products tab: add / edit / delete products, upload a photo (auto-resized). Orders tab: see orders, update status.

## M-Pesa STK Push (optional env vars; without them orders are saved and you follow up manually)
MPESA_KEY, MPESA_SECRET (Daraja app), MPESA_SHORTCODE, MPESA_PASSKEY,
MPESA_CALLBACK_URL = https://YOUR-DOMAIN/api/mpesa/callback  (must be public HTTPS)
MPESA_ENV = sandbox (default) or live. Register at developer.safaricom.co.ke, test in sandbox first, then Go Live.

## Deploy on Render.com
1. Push this folder to GitHub. 2. New > Web Service > select repo. 3. Build: npm install | Start: npm start
4. Environment: ADMIN_KEY (+ M-Pesa vars). 5. IMPORTANT: add a Persistent Disk (paid plan) mounted at the app folder,
   or products, photos and orders reset on every restart. 6. Add custom domain e.g. shop.ourusuperstores.com (CNAME at your DNS host).
VPS alternative: Node 18+, git clone, npm i, run with pm2, Nginx + Certbot for HTTPS.

## Card payments
Not wired yet: add Pesapal / Flutterwave / DPO in the order handler where payment==='card'.
