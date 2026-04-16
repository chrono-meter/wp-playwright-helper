import type { FullConfig } from '@playwright/test'
import { cwd } from 'node:process'
import { join } from 'node:path'
import { getInstalledRootDirectory, getInstanceParameters, installWordPress } from './wpcli.js'


export default async function (config: FullConfig) {
    const baseUrl = config?.projects?.[0]?.use?.baseURL || process.env.WP_BASE_URL
    const metadata = config?.metadata?.globalSetup

    if (metadata?.beforeInstallWordPress) {
        await metadata.beforeInstallWordPress(config)
    }

    /**
     * The path to the WordPress instance, which should already have a wp-config.php file with valid database credentials.
     * This function will install WordPress using wp-cli commands, so the database should be accessible and properly configured in the wp-config.php file.
     */
    const existingDevInstancePath = getInstalledRootDirectory(cwd())

    const { url, abspath, config: wpConfig, version, locale } = getInstanceParameters(existingDevInstancePath)

    if (!baseUrl || !baseUrl?.startsWith(url)) {
        throw new Error(`The base URL ${baseUrl} is not valid. It should start with ${url}. Please check your Playwright configuration.`)
    }

    /**
     * A part of URL to access the *NEW* WordPress instance.
     *
     * For example, if `subDirectoryName` is `wp1`, and the base URL to access the instance is `http://localhost:8080/`, then the WordPress instance will be accessible at `http://localhost:8080/wp1/`.
     * And new WordPress will be installed under directory `path/wp1/`.
     */
    const subDirectoryName = baseUrl.slice(url.length).replace(/^\/?/, '').replace(/\/?$/, '')

    const newInstancePath = join(abspath, subDirectoryName)

    const installationOptions = {
        url: baseUrl!,

        // Reuse the existing database credentials.
        dbHost: wpConfig.DB_HOST,
        dbName: wpConfig.DB_NAME,
        dbUser: wpConfig.DB_USER,
        dbPassword: wpConfig.DB_PASSWORD,

        // Inherit some values from the existing dev instance for convenience.
        version: version,
        locale: locale,

        // Use fixed value for administrator credentials and some values, as they are required for e2e tests and it's more convenient to hardcode them here.
        adminUser: process.env.WP_USERNAME || 'admin',
        adminPassword: process.env.WP_PASSWORD || 'password',
        adminEmail: 'admin@wordpress.local',
        title: 'WordPress e2e Testing',

        force: metadata?.force ?? true,
    }

    installWordPress(newInstancePath, installationOptions)

    if (metadata?.afterInstallWordPress) {
        await metadata.afterInstallWordPress(config, { ...installationOptions, abspath: newInstancePath })
    }
}
