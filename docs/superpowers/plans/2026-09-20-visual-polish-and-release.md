# Visual Polish and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scenario comparison, shared mode and management mode visually smooth, dimensional and accessible, then release them safely without affecting other sites.

**Architecture:** Use semantic CSS layers and small state classes from React; all depth comes from gradients, shadows and transforms rather than images or a rendering dependency. Release uses existing GitHub Actions; Nginx is manually audited and edited only for the `kolbaski.kzkovich.ru` host.

**Tech Stack:** CSS, React 18, Vite, GitHub Actions, Nginx, systemd.

**Spec:** `docs/superpowers/specs/2026-09-20-scenarios-sharing-management-design.md`

## Global Constraints

- Motion uses only `transform` and `opacity`, includes `prefers-reduced-motion`, and has no infinite per-card animation.
- Focus, diff status and risk remain legible without colour.
- Do not modify unrelated Nginx server blocks or remove TLS/proxy headers.
- Do not push until all tests/build checks pass; validate CI and production after push.

## Review Focus

- Reduced-motion users see the same comparison meaning without motion.
- Dense management rows remain readable at compact zoom.
- A keyboard user can focus, inspect and select a changed feature.
- Disabling Basic Auth affects only the Kolbaski host.
- HTTPS sessions remain Secure after proxy configuration changes.

---

### Task 1: Ceramic comparison and management visual system

**Files:**
- Modify: `src/styles.css`, `src/components/SegmentBar.tsx`, `src/components/SchedulerCompare.tsx`, `src/components/ManagementTimeline.tsx`, `src/components/ScenarioChangesList.tsx`
- Create: `src/components/ScenarioChangesList.test.tsx`

**Interfaces:**
- Uses classes `scenario-base-bar`, `scenario-proposal-bar`, `scenario-delta-left`, `scenario-delta-right`, `management-bar`, `management-baseline`, `management-status-*`.

- [ ] **Step 1: Add visual-state assertion**

```ts
it('labels a moved proposal with text for assistive technology', () => {
  render(<ScenarioChangesList diff={rightShiftDiff} teamFilter="ALL" onSelect={() => {}} />);
  expect(screen.getByText(/перенесена на 2 спринта позже/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- src/components/ScenarioChangesList.test.tsx`

Expected: FAIL until the change list exposes explanatory text.

- [ ] **Step 3: Add composited depth and reduced motion**

Create shared custom properties for light edge, surface and shadow. Give proposals a 2–4px lift on focus/hover, base bars 0.38 opacity and dashed outline, management bars a smaller radius/shorter shadow. Add:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

Do not use `filter: blur()` on scrolling content or infinite segment animations.

- [ ] **Step 4: Verify visuals and accessibility**

Run: `npm test && npx tsc -b --force && npm run build`

Expected: PASS. Capture desktop screenshots in detailed, scenario, shared and management modes; tab through changed feature selection; emulate reduced motion and confirm no movement obscures the delta.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/components/SegmentBar.tsx src/components/SchedulerCompare.tsx src/components/ManagementTimeline.tsx src/components/ScenarioChangesList.tsx src/components/ScenarioChangesList.test.tsx
git commit -m "style: refine dimensional scenario and management views"
```

### Task 2: Safe production rollout

**Files:**
- Modify: `DEPLOYMENT.md`
- Verify: `.github/workflows/deploy.yml`, production Nginx site config, `kolbaski.service`

**Interfaces:**
- Nginx forwards `/api/` to `127.0.0.1:5175` with `X-Forwarded-Proto $scheme`.
- The Kolbaski server block has no `auth_basic` directive or inherited location-level Basic Auth.

- [ ] **Step 1: Document exact server validation**

Add these commands to `DEPLOYMENT.md` with explicit target scope:

```bash
sudo nginx -T | sed -n '/server_name kolbaski\\.kzkovich\\.ru/,/}/p'
sudo cp /etc/nginx/sites-available/kolbaski.kzkovich.ru /etc/nginx/sites-available/kolbaski.kzkovich.ru.bak-$(date +%F-%H%M%S)
sudo nginx -t && sudo systemctl reload nginx
```

The edit removes only `auth_basic` and `auth_basic_user_file` from that server/location; retain HTTPS, `proxy_pass`, and forwarded headers.

- [ ] **Step 2: Run final local verification**

Run: `npm test && npx tsc -b --force && npm run build && git diff --check`

Expected: every command exits 0.

- [ ] **Step 3: Commit release documentation**

```bash
git add DEPLOYMENT.md
git commit -m "docs: add safe public launch verification"
```

- [ ] **Step 4: Push and monitor CI**

Run: `git push origin main`

Expected: GitHub Actions workflow **Deploy Kolbaski** completes successfully. Do not run manual deployment commands that bypass the workflow.

- [ ] **Step 5: Audit and change only target Nginx host**

On production, inspect rendered configuration, save dated backup, remove Basic Auth only from `kolbaski.kzkovich.ru`, then run `sudo nginx -t` before reload. Abort if the rendered block contains another `server_name` or shared include that would affect another project.

- [ ] **Step 6: Production smoke test and release note**

Open `https://kolbaski.kzkovich.ru/` in a fresh browser profile. Confirm no Basic Auth prompt; register/login; verify Secure session cookie; create/revoke share link; visit it as another user; create a comment; compare a scenario; open management mode. Report commit, CI run and observed outcomes.

