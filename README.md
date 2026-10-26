# My Homies for X

Highlights your followers’ display names on the X timeline using your X theme's primary color. Useful when browsing the "For You" timeline where followers are interleaved with non-followers.

## Install

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and select `manifest.json` or the extension ZIP.
3. Reload X.

## Build your follower cache

1. Open your profile’s **Followers** page and select **Followers**.
2. Click **Build follower cache**.
3. Leave the tab open while it scrolls. When it finishes or you click **Stop**, the collected accounts replace your previous cache. Stopping early saves a partial list.
4. Return to your timeline.

The extension also learns follower relationships when X supplies them while you browse. Open **My Homies** in Firefox’s extensions menu to check detection and cache counts.

## Good to know

- The cache stays on your computer, separately for each account, and survives browser restarts. Removing the extension clears it.
- The cache does not update automatically so be sure to run it periodically if your account has many updates to followers
