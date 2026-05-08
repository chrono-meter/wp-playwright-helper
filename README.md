# @chrono-meter/wp-playwright-helper
Setting up an End-To-End (E2E) test environment is quite difficult in practice and will likely cause you some trouble.

Building an environment that closely resembles the actual execution environment of the distributed code requires extensive permissions and complex prerequisites.

Fortunately, your development environment appears to have an HTTP server and a MySQL-compatible database, so let's use those. This choice may be somewhat crude, but now all that's needed for the e2e test environment is a Playwright runtime environment.

You can run Playwright directly on your machine, or you can run Playwright within a dev container and use the [Light-weight Desktop (desktop-lite)](https://github.com/devcontainers/features/tree/main/src/desktop-lite) GUI. You might also be able to use the [docker image](https://hub.docker.com/r/microsoft/playwright).


# Important notes
**At first, please back up your data to prepare for potential data loss.**

This package creates a WordPress instance in the following way, it will try to reuse your development environment as much as possible:

 1. Search for a development WordPress instance relative to the current directory, i.e., the directory where `playwright.config.ts` is located.
 1. Reuse following variables from the development WordPress instance.
    * Database authentication information
    * WordPress version
    * Current site locale
    * Site URL
 1. Read administrator user name `WP_USERNAME` (default: `admin`) and password `WP_PASSWORD` (default: `password`) from environment variables.
 1. Generate a new table prefix.
 1. The subdirectory where the test instance will be installed is determined by your Playwright configuration's `baseURL` (as JSONPath form: `$.use.baseURL`). The sample uses `.e2etest`.
 1. Install WordPress in subdirectory of the development WordPress instance, using WP-CLI.

Finally, the URL of new WordPress instance will be like `http://localhost/.e2etest/`.


# Install dependencies
```sh
npm install --save-dev @playwright/test @wordpress/e2e-test-utils-playwright @chrono-meter/wp-playwright-helper
# else
pnpm add --save-dev @playwright/test @wordpress/e2e-test-utils-playwright @chrono-meter/wp-playwright-helper
```


# `playwright.config.ts`
```ts
/// <reference types="node" />
import type { FullConfig } from '@playwright/test'
import { defineConfig } from '@playwright/test'
import { createRequire } from 'node:module'
// import { execSync } from 'node:child_process'
// import { chdir } from 'node:process'
// import path from 'node:path'
// import { wp, enableDebugLog } from '@chrono-meter/wp-playwright-helper/wpcli'

const require = createRequire(import.meta.url)


/**
 * Fill in environment variables before importing `@wordpress/e2e-test-utils-playwright`.
 * 
 * @link https://github.com/WordPress/gutenberg/blob/trunk/packages/e2e-test-utils-playwright/src/config.ts
 */
process.env.WP_BASE_URL = process.env.WP_BASE_URL || 'http://localhost/.e2etest/'  // Must be ends with a slash.


// In dev container environment, Playwright's HTML reporter should listen on all interfaces to be accessible from host machine.
process.env.PLAYWRIGHT_HTML_HOST = process.env.PLAYWRIGHT_HTML_HOST || (process.env.REMOTE_CONTAINERS === 'true' ? '0.0.0.0' : 'localhost')


/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    globalSetup: require.resolve('@chrono-meter/wp-playwright-helper/global-setup'),

    use: {
        // The subdirectory where the test instance will be installed is determined by `baseURL`.
        baseURL: process.env.WP_BASE_URL,
        // locale: 'ja-JP',  // Testing using only the "en-US" locale no longer seems sufficient.
        ignoreHTTPSErrors: true,  // SHOULD be `true` for testing in dev container environment with self-signed certificate.
        // ...and more options
    },

    metadata: {
        globalSetup: {
            // adminUser: 'admin',
            // adminPassword: 'password',
            // adminEmail: 'admin@wordpress.local',
            // siteTitle: 'WordPress e2e Testing',
            // version: 'latest',
            // locale: 'ja',

            // Setup steps before WordPress installation, such as building the plugin and preparing the test environment.
            beforeInstallWordPress: async (config: FullConfig) => {
                // const cwd = process.cwd()
                // chdir(import.meta.dirname)
                // try {
                //     execSync('pnpm run build', { stdio: 'inherit' })
                //     // Package the plugin into a zip file for installation.
                // } finally {
                //     chdir(cwd)
                // }
            },

            // Setup steps after WordPress installation, such as activating the plugin and configuring settings.
            afterInstallWordPress: async (config: FullConfig, installationParams: { abspath: string }) => {
                // await enableDebugLog(installationParams.abspath)

                // Install small theme.
                // wp('theme', 'install', 'classic', '--activate', '--path=' + installationParams.abspath)

                // Install the plugin to be tested.
                // wp('plugin', 'install', path.join(import.meta.dirname, './release/test.zip'), '--path=' + installationParams.abspath)
            },
        },
    },

    // ...other global config options
})
```


# `e2e/test-sample.ts`
```ts
import { test as base, expect } from '@playwright/test'
import { extendTestWithFixtures } from '@chrono-meter/wp-playwright-helper/fixtures'
const test = extendTestWithFixtures(base)


test('should open posts list page', async ({ page, admin }) => {
    await admin.visitAdminPage('edit.php')
})
```


# `package.json`
```json
{
    "scripts": {
        "setup:e2e": "pnpm exec playwright install --with-deps",
        "test:e2e": "pnpm exec playwright test"
    }
}
```