# Mosse Tech LTD — Inventory, Sales & Wholesale Stock Platform

**Status:** Implementation blueprint based on static inspection of `bloomkigali-main.zip` and the two supplied images. This is a proposal, **not** a completed conversion or a claim of tested functionality.

**Intended business:** Mosse Tech LTD, owned and administered by Moses; an electronics business focused on laptop and phone accessories, also selling laptops and sometimes phones.

**Intended external deployment:** User wrote `mossetech.store` (confirm exact spelling and domain ownership). Existing business site provided by user: `https://www.mossetech.rw/`. Automated access to that site returned HTTP 403, so business details were not independently verified from the live website. The screenshot and logo supplied by the user are the available visual references.

## 1. Non-negotiables

- Preserve the working Bloom Kigali repository as a source/reference, not as a connected live service. Create a separate Mosse Tech project and separate database, media bucket, environment secrets, and authenticated sessions.
- Do not migrate flower shop data, users, sales, customers, inventory, or passwords to Mosse Tech.
- No hard deletion of staff accounts. Keep staff-related history and business audit records intact.
- Moses is the business `OWNER` with unrestricted administration; staff have explicitly assigned roles/permissions enforced in server actions and routes.
- Public visitors can view only deliberately published products and their approved public stock information. They must never see cost price, profitability, private records, customer data, staff data, or internal notes.
- Mobile and tablet must be first-class: intuitive mobile shop operations, accessible controls, no sideways scrolling, light/dark modes, and installable PWA experience.
- Use short, everyday labels (Sales, Products, Stock, Customers, Money, Staff, Reports, Settings).
- Change and validate one cohesive feature at a time. Run code checks and functional tests before changes are considered complete or committed.

## 2. Verified source audit

The uploaded source is a Next.js 16.2.9 + React 19.2.4 + TypeScript monorepo using pnpm, Drizzle ORM and PostgreSQL, with a PWA/offline-sync implementation.

| Area | Already present in source | Gap to solve |
| --- | --- | --- |
| Products | Products, categories, one image, base sales price, available quantity, archiving, optional database wholesale price and minimum quantity | Electronics model/SKU/specs/compatibility/variants, multi-image gallery, editable buying/retail/wholesale pricing, public publishing |
| Stock | Receiving stock, damaged stock, histories, current quantities, low-stock indicator | Supplier tracking and product identifiers; better electronics adjustments; assurance public availability stays accurate |
| Sales | Sale recording, payments, later payments, discounts and corrections | Expose configurable wholesale prices/minimum quantity in workflow, electronics warranty/serial handling where relevant |
| Customers/finances | Customers, debts, money, expenses, cash drawer and reports | Electronics-specific reporting, verified margins from actual costs, wholesale customer segmentation |
| Staff | OWNER/EMPLOYEE roles, ACTIVE/DISABLED account status; owner can edit a staff name/phone, reset password, stop/restore access | Staff creation, staff email edit, explicit permission assignment, suspend/deactivate distinction, no-hard-delete lifecycle, audit history |
| Public catalogue | Existing public landing page is a sign-in landing page | Searchable, mobile-first published stock page with selectable disclosure of exact quantities and sharable link |
| Design | Bloom colors, logo, flower imagery and descriptive text | Full Mosse Tech visual identity across UI, emails, metadata, icons, public stock and PDF exports |

**Code pointers:** `packages/db/src/schema.ts`; `apps/web/src/lib/auth/session.ts`; `apps/web/src/lib/settings/password-actions.ts`; `apps/web/src/app/(owner)/settings/staff-access-form.tsx`; `apps/web/src/app/(owner)/products/product-form.tsx`; `apps/web/src/lib/products/actions.ts`; `apps/web/src/app/globals.css`; `apps/web/src/app/page.tsx`; `apps/web/src/app/manifest.ts`.

**Security blocker:** `.env.example` in the uploaded ZIP contains a database URI with an embedded password and sample owner/staff passwords. Treat those as potentially exposed and rotate wherever used. Never carry the old secret values into the new deployment, version-control real secrets, or run the provided seed script against the old database. The seed is an upsert that also overwrites passwords and account statuses.

## 3. Brand direction

The supplied Mosse Tech logo is black/dark charcoal, bright cyan-blue, and graphite. Approximate blue sampled from the attached raster logo is `#018EFA` (color pick from a JPEG, not a verified official HEX specification). Suggested tokens to test for legibility and contrast:

| Token | Suggested light | Suggested dark |
| --- | --- | --- |
| Primary | `#018EFA` | `#38A6FF` |
| Background | `#F7F9FC` | `#0D1117` |
| Surface | `#FFFFFF` | `#161D26` |
| Text | `#162434` | `#F3F7FA` |
| Muted | `#617081` | `#A6B3C2` |
| Border | `#DCE5EE` | `#2C3948` |

Avoid gold, flower visuals, UI gradients, decorative glass effects, unnecessary large-radius boxes, overcrowded dashboards and gimmicky charts. Favor premium typography, compact reliable navigation, deliberate density, high-quality product photography, readable tables, practical filters and fast daily workflows.

## 4. Electronics catalogue data model (proposed, to design before migration)

**Base product:** internal ID, human-readable SKU (unique), name, category, brand, model, optional condition (new/used/refurbished), description, included parts, supplier, photos, barcode, retail price, wholesale price (optional), minimum wholesale order, cost price (restricted), available quantity, low-stock threshold, draft/active/archived status, publish-to-public flag, publication timestamp, created/updated by, created/updated at.

**Category examples (not final):** laptop chargers/power adapters, batteries, SSD/HDD/storage, RAM, laptop keyboards, screens and spare parts, mouse/keyboards, USB hubs/adapters/cables, phone chargers, phone cases, screen protectors, earphones/headphones, power banks, laptops, phones, other accessories.

**Compatibility:** store structured compatible brand/device/model information for parts, optionally wattage, connector, capacity and other relevant technical specifications. Keep these optional unless a category requires them. Add product variants if same model has sellable differences (e.g., SSD capacity, connector type) that require separate prices/quantities. Do not silently merge inventory for incompatible variants.

**Devices:** optionally track unique serial number/IMEI per laptop/phone unit for warranty and stock traceability; protect identifiers from public disclosure. Do not require serial tracking for everyday accessories.

**Prices:** all money displayed in RWF. Cost/retail/wholesale are separate. Public pricing is Moses-controlled; never expose supplier costs or margins. Document who is allowed to override selling prices.

**Inventory invariant:** stock received increases available stock; completed sale decreases available stock; verified damage/adjustment reduces or changes it; corrections reverse the appropriate ledger entry. Use transactions and atomic stock checks to prevent selling more than the available quantity. Public counts must reflect server-authoritative stock, not uncommitted offline records.

## 5. Owner and staff lifecycle

**Moses (OWNER):** full access to create/update staff, manage staff roles, activate, suspend, deactivate, rotate credentials, inspect histories, manage prices and publication, review all money/reporting and business settings. Prevent disabling/removing the last active owner through staff screens.

**Staff status model:** `ACTIVE` (can sign in), `SUSPENDED` (temporary lock), `DEACTIVATED` (access ended; business history retained). No hard delete. Suspended/deactivated users must lose all active server sessions, including the ability to submit queued offline changes. Reinstatement is an explicit OWNER action only. A password reset must not accidentally reactivate the staff member.

**Proposed permission groups:** Sales & payments; Products & stock; Customers & unpaid sales; Expenses & cash drawer; Reports & cost/profit; Staff & settings (owner only). These can be grouped into assignable, owner-controlled presets such as Shop assistant, Stock manager and Supervisor; enforce exact capabilities on the server rather than hiding links only. Log changes in permissions, access statuses, prices and inventory.

**Staff flows:** Create staff -> assign permissions -> secure initial access -> active work -> edit permissions/profile -> suspend/reactivate or permanently deactivate (soft status). Preserve sales and stock event attribution even after departure.

## 6. Public wholesale stock page

**Suggested path:** `https://<confirmed-deployment-domain>/stock` or `/wholesale`, reachable without login. Prefer a publicly sharable URL with separate internal `/dashboard`, `/sales`, etc. Existing `mossetech.rw` site remains independent unless explicitly planned otherwise.

**Visitor experience:** shop logo, concise headline (for example, “Check available electronics stock”), prominent search bar, category chips/filters, images, item title, compatibility/specifications, availability, exact quantity for products Moses chooses to disclose, optional public wholesale price and minimum order quantity, and clear WhatsApp inquiry action. Show public last-updated information. Excellent phone layout and quick load even with many products. Never list private or archived products.

**Owner publishing controls:** per-product `Publish on stock page` toggle; `Show exact quantity` option (on if Moses wants to disclose it); optional `Show wholesale price`; product unpublish. Provide direct copy/share link, optionally to a filtered category/product, and WhatsApp share. If available=0, show Out of stock only when publication settings allow it; otherwise hide. Public endpoint returns a strict whitelist of product fields, with rate limiting/abuse protection and no exposed internal IDs or customer/finance data.

**Sales integration:** public stock is a catalogue/inquiry channel, not necessarily online checkout or stock reservation. Wholesale orders must be confirmed against inventory before sale.

## 7. Ordered implementation checklist and acceptance gates

- [ ] **00 — Safeguard & duplicate:** inspect git state; fork/clone to a new `mossetech` project; remove old credentials; rotate exposed-looking secrets; make fresh DB/storage; capture baseline lint/typecheck/build and document existing behavior. No Bloom DB connection used during Mosse Tech setup.
- [ ] **01 — Brand foundation:** rename packages/imports safely; update branding, logos, web/PWA icons, metadata, fonts, theme tokens, login/landing/navigation/PDF exports, all flower terms. Verify light/dark and mobile screens.
- [ ] **02 — Electronics product model:** safely migrate schema and validators; create/edit/archive products with suitable categories, SKU, brand, model, compatibility, photo(s), costs/pricing/stock visibility. Database migrations reversible/testable.
- [ ] **03 — Stock workflow:** receive, adjust, damage, return and track inventory by variant when relevant; low-stock alerts; transactionally correct quantity math and immutable history.
- [ ] **04 — Owner & staff management:** create staff; grant/revoke scoped permissions; suspend, activate and deactivate without deletion; revoke sessions; safeguard offline sync and sensitive server endpoints; add audit trail.
- [ ] **05 — Wholesale selling:** configure retail and wholesale price, minimum quantities, buyer records, adjustments approvals, receipts and truthful cost/profit reporting.
- [ ] **06 — Public catalogue:** live published products and safe quantity lookup; search/categories/product details; owner sharing/publishing settings; WhatsApp inquiry links; responsive testing and abuse safeguards.
- [ ] **07 — Dashboard & reports:** useful accessories/wholesale KPIs, low-stock, profit and money positions, stock movement, sales by category/staff; use tested figures, no decorative filler.
- [ ] **08 — Production hardening:** automated tests for roles, account lifecycle, stock math, concurrent sales, offline queue, public data leak protection, invoice handling; validation for RWF and Kigali local date; performance/accessibility/browser/device checks; backups, monitoring and deployment.
- [ ] **09 — Production sign-off:** owner review by Moses, sample product imports, permission walkthrough, live public stock share to WhatsApp, domain/DNS verification, correct environment segregation and rollback plan.

## 8. Key acceptance scenarios

1. Moses creates a staff member, assigns a specific role and can later suspend/re-activate/deactivate the account; historical records remain intact and the staff member cannot perform unauthorized actions.
2. A stock manager receives 20 chargers and makes an authorized sale of 3; the internal stock and published public quantity update consistently to 17 after completion. Pending offline transactions do not falsely change public counts.
3. Customer opens a WhatsApp-shared page on a phone without sign-in, searches “USB-C charger,” finds a product, sees Moses-approved availability/quantity and starts an inquiry.
4. Product is unpublished, archived or unavailable; the public catalogue obeys the chosen publication policy immediately, regardless of old cached pages.
5. Owner can see costs and profits, but public visitors and staff without those permissions cannot, including via direct URL or request.
6. The project passes lint, TypeScript checks, build and scenario-specific tests without reaching any Bloom Kigali production system.

## 9. Open decisions (do not guess)

- Confirm deployment domain. The message specifies `mossetech.store` but the brand and `.rw` website spell “mossetech”.
- Determine whether Moses wants exact quantities shown for all published products or to have a per-product setting (recommended).
- Confirm public wholesale pricing: visible to everyone, only on inquiry, or configurable by product (recommended).
- Obtain owner-approved business WhatsApp number, shop address and contact details. They are not verified from the live website.
- Confirm whether serial/IMEI tracking and multiple store locations are needed in the first release.

**Current deliverable:** Source audit + implementation specification. No source files or production systems were modified or deployed. All unimplemented features above remain unchecked.
