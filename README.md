# Backyard Events SG: two Cloudflare sites

- `public-site/` is the website visitors use. It can only show events and take booking requests. It has no admin page or password in it.
- `admin-site/` is your private dashboard (bookings, adding events, photos). It is a separate Cloudflare project with its own hard-to-guess address.
- `schema.sql` creates the shared database. Both sites use the same database and photo storage.

You need a free Cloudflare account and Node.js (for the `wrangler` command). Run the commands below from this folder unless it says otherwise.

## One-time setup (shared)
1. `npx wrangler login`
2. `npx wrangler d1 create backyardeventssg` then copy the `database_id` it prints into BOTH `public-site/wrangler.toml` and `admin-site/wrangler.toml`.
3. `npx wrangler r2 bucket create backyardeventssg-images`
4. `npx wrangler d1 execute backyardeventssg --remote --file=schema.sql`

## Public site
5. Edit the `C = {...}` line near the bottom of `public-site/public/index.html`: email, Instagram link and Facebook link (leave `fb` empty to hide it). Your WhatsApp number is already set.
6. Optional: put photos in `public-site/public/img/` named `1.jpg`, `2.jpg`, `3.jpg` for the home page.
7. `cd public-site` then `npx wrangler pages deploy public --project-name backyardeventssg`
8. Add your own domain under Workers & Pages > backyardeventssg > Custom domains.

## Admin site (private)
9. Open `admin-site/wrangler.toml` and change `byesg-manage-CHANGE-ME` to a name nobody could guess, such as `byesg-manage-7k3q`. This becomes the address `that-name.pages.dev`. Don't link to it from the public site.
10. `cd ../admin-site` then `npx wrangler pages deploy public --project-name <your-admin-name>` (use the same name as step 9)
11. Set the admin password: `npx wrangler pages secret put ADMIN_PASSWORD --project-name <your-admin-name>` (choose a long one)
12. Lock it with Cloudflare Access (free for small teams): in the Cloudflare dashboard open Workers & Pages > your admin project > Settings and turn on the Access policy, then allow only your own email. Visitors then have to enter a one-time code sent to your email before the page even loads. Your admin password stays as a second lock.
13. Open `https://<your-admin-name>.pages.dev`, log in, and add your first event.

## PayNow payment links (HitPay)
After you confirm a vendor on WhatsApp, open their booking in the admin site and press **Create payment link**. It makes a HitPay link for the exact booking total. The vendor opens it and sees a PayNow QR code with that fixed amount. You can send the link on WhatsApp in one tap, and press **Check if paid** (or let HitPay tell the site automatically, below).

14. Create a free HitPay account at hitpayapp.com and turn on PayNow. Also create a HitPay **sandbox** account for testing.
15. From `admin-site`: `npx wrangler pages secret put HITPAY_API_KEY --project-name <your-admin-name>` and paste your HitPay API key. Until you do step 18 the site talks to HitPay's sandbox, so test with the sandbox key first. Sandbox links don't take real money.
16. Automatic Paid status (optional but nice). HitPay tells the public site when a payment lands, and the booking turns Paid by itself. Two parts:
    - From `public-site` run `npx wrangler pages secret put HITPAY_SALT --project-name backyardeventssg` and paste the **Salt** from HitPay's Developers page (the API-key salt).
    - In the admin project's Settings > Variables and Secrets, add `PUBLIC_URL` = your public site address (for example `https://backyardeventssg.pages.dev`). New payment links then tell HitPay where to report. HitPay also supports dashboard webhooks (Developers > Webhooks, endpoint `https://<your-public-domain>/api/hitpay`); if you use one, save its salt as `HITPAY_WEBHOOK_SALT` on the public site.
    The webhook goes to the public site so Cloudflare Access doesn't block it. I couldn't test HitPay's callback against a real account, so check it in the sandbox (step 17). If a booking ever doesn't flip, press **Check payments** at the top of the Bookings tab. It asks HitPay about every unpaid link at once.
17. Make a test booking, create its link, pay it in the sandbox and check the booking turns Paid.
18. Going live: swap in your live HitPay API key (step 15 again) and set the live address: add `HITPAY_BASE` = `https://api.hit-pay.com/v1` as a variable in the admin project's Settings > Variables and Secrets, then redeploy.

If a site can't see the database or photos, open its project in Workers & Pages > Settings > Bindings and add a D1 binding named `DB` and an R2 binding named `BUCKET`, then redeploy that site.

Already ran an older version? See the notes at the top of `schema.sql` for updating the database.

## Updating an older database
If you already set up the database before the brand-category and contacts features, run these from this folder (once each) instead of recreating the tables:
`npx wrangler d1 execute backyardeventssg --remote --command "ALTER TABLE bookings ADD COLUMN category TEXT DEFAULT ''"`
Then run the `CREATE TABLE IF NOT EXISTS contacts` statement from `schema.sql` (copy it into `--command "..."`). Also add the earlier `social`, `pay_id` and `pay_url` columns if you haven't yet (see the comments at the top of `schema.sql`). In the admin site, Contacts > "Import from bookings" fills the contact list from bookings you already have.

## Site content tab (edit the public site from the admin)

The admin has a **Site content** tab for the banner, homepage headline, intro and photos, contact details, theme wording, FAQ and policies, and the brand categories. Changes show on the public site within about a minute, with no redeploy.

It needs one extra table in your database. New databases get it from `schema.sql`. If you set the database up earlier, open the D1 console (Workers & Pages, D1, your database, Console) and run:

```
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

Until you save something, the public site keeps showing the wording written in its page, so nothing breaks. The first time you open the tab it is pre-filled with that wording, so you only change what you want.

Layout, fonts and colours are not editable from the admin. They live in `public-site/public/index.html`.


## New features: waitlist, applications, terms, line-up, WhatsApp list and more

**1. Upgrade the database once.** If your database was created before these features, run the statements in `upgrade.sql` in the D1 console (Workers & Pages > D1 > your database > Console), one at a time. A line saying "duplicate column name" just means that part is already done. Until you do, the admin shows an orange banner and the new features stay off, but normal bookings keep working. New databases get everything from `schema.sql`.

**2. Email alerts (optional).** The public site can email you every new booking, application and payment, and send each vendor a receipt. It uses Resend (resend.com, free tier is enough):
- Make a Resend account, add and verify your domain, and create an API key.
- From `public-site` run these (one at a time, each asks for the value):
  `npx wrangler pages secret put RESEND_API_KEY --project-name backyardeventssg`
  `npx wrangler pages secret put MAIL_FROM --project-name backyardeventssg` (for example `Backyard Events <bookings@yourdomain.com>`)
  `npx wrangler pages secret put NOTIFY_EMAIL --project-name backyardeventssg` (your email; separate several with commas)
- Redeploy the public site. Nothing is sent until all three are set.
WhatsApp alerts can't be automated for free: WhatsApp only allows automatic messages through its paid Business API. Email alerts, the orange count on the Bookings tab and a phone notification from your email app are the practical alternatives.

**3. What each feature does**
- **Terms tick-box.** Write your terms under Site content > Booking terms. Vendors must tick that they agree, the terms get their own page, and each booking shows when the vendor accepted. Clear the box to turn it off.
- **Waitlist.** When a market is full, the button becomes "Join the waitlist". Waitlist entries don't use up booths. Set one to Approved when a space opens.
- **Vendor applications.** Tick "This market is by application" on an event. Vendors send a link to their products and a note, the booking arrives as Applied, and you set it to Approved or Declined. A payment link can only be made after Approved.
- **Vendor info pack.** Write load-in times, parking and so on in the event's form. Press **Copy vendor info link** on the event card and paste it to confirmed vendors on WhatsApp. Only people with that link can read it. Set your public website address under Site content first.
- **Who's selling.** On a booking that is Approved or Paid, tick "Show on event page" and the brand name, category and link appear on that event's page. Phone and email are never shown.
- **Past markets and quotes.** Add photos and vendor quotes under Site content. They appear on the homepage once added.
- **WhatsApp list.** Shoppers join from the homepage and the contact page and tick a consent box. See them under Shoppers.
- **Remember my details.** Returning vendors get the form pre-filled on the same phone or computer. Details are stored on their device only, and they can clear them from the form.
- **Send a message.** Pick vendors of an event, a brand category, or the shopper list, write the message once, and tap each person's button to send it on WhatsApp.
- **Summary.** Paid and awaiting-payment totals by event, month and brand line.
- **Backup.** "Download backup" at the top of the admin saves all events, bookings, contacts, shoppers and site content as one file. Do it before big changes. Photos stay in Cloudflare R2 and aren't in the file.
