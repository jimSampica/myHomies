# My Homies for X

A Firefox extension that adds a **Follows you** badge beside timeline authors using explicit X relationship data or a locally saved copy of your Followers list. It reads no cookies and sends no data to external servers. The Followers-page scanner scrolls the normal website, causing X to load additional list pages as it ordinarily would.

## Install

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and select `manifest.json` in this folder, or the release ZIP.
3. Open X, sign in normally, and **reload the page**.
4. Scroll the timeline. Open **My Homies** from Firefox's extensions menu to see diagnostics.

## Build a persistent follower cache

Open your own profile's **Followers** list (`https://x.com/YOUR_HANDLE/followers`), select the **Followers** tab if X initially opens Verified followers, and press **Build follower cache** at the top. The extension identifies your account from the sidebar Profile link and only shows this control on that account's Followers page. Start from the top of the list for the best coverage.

Leave that tab open while it scrolls. Progress shows accounts saved this run and total accounts cached. Press **Stop** at any time; saved accounts remain. The scan also stops on navigation, after 12 seconds without new accounts, or after 30 minutes. These limits do not prove the list is complete: slow loading or X restrictions can leave a partial cache. Run again to collect more.

Return to the timeline to see badges. Other open X tabs load the updated cache when reloaded. Cache entries live in Firefox extension local storage, separately for each account, across browser restarts. Re-running adds and refreshes entries; it does not remove absent users because the scan might be incomplete. Unfollowers and renamed handles can therefore leave stale entries. Removing the extension clears its local storage.

Temporary installations disappear when Firefox restarts. Permanent installation in standard Firefox requires Mozilla signing. The ZIP is an unsigned development package.

## Detection limits

This implementation still needs verification against your signed-in X session. If diagnostics count JSON responses but no explicit relationships after scrolling, X may omit follower status. No badge means **unknown or not confirmed**, never proof that someone does not follow you.

The parser supports explicit boolean `followed_by` fields on user records in legacy, perspectives, relationship_perspectives, and top-level shapes. `following` is deliberately ignored because it describes the opposite relationship. Fixtures are synthetic, not captured live X responses. Changes to X may require updates.

Passively observed relationship data is isolated per tab and clears on a full page load, closing the tab, or restarting the extension. The saved Followers-page cache persists per account. **Reload after switching X accounts**, especially if X switches without navigating. Relationships can become stale. Badges target top-level authors, not quoted posts.

## Implementation and checks

Firefox Manifest V2 with a persistent background page uses `webRequest.filterResponseData` to inspect existing GET responses under `https://x.com/i/api/*`. Original response chunks are forwarded immediately; a copy is parsed after completion with an 8 MiB cap. Firefox requires `webRequest` and `webRequestBlocking` permissions for this response filter. The `storage` permission saves the follower cache. No request is canceled or rewritten. Host access is limited to `https://x.com/*`.

Run `node --test tests/*.test.cjs` for synthetic extraction and response-forwarding checks. For live validation, confirm popup counters increase, compare a badge with the profile's own follower indicator, test scrolling, and reload after account switching. Do not share raw responses, which may contain private account data.

References: [Firefox response filtering](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData), [content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).
