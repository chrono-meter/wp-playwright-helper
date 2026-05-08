import { spawnSync, SpawnSyncReturns, type SpawnSyncOptions } from 'node:child_process'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { chdir } from 'node:process'


export class CommandError extends Error {
    status: SpawnSyncReturns<string>['status'];
    stdout: SpawnSyncReturns<string>['stdout'];
    stderr: SpawnSyncReturns<string>['stderr'];

    constructor(result: SpawnSyncReturns<string>) {
        super(result.stderr);
        this.status = result.status
        this.stdout = result.stdout
        this.stderr = result.stderr
    }
}


export class WPCliError extends Error { }
export class WPInstallError extends Error { }
export class WPAlreadyInstalledError extends Error { }


/**
 * Execute a shell command and throw when the command exits with a non-zero status.
 */
export function execCommand(command: string, args: string[], options: Omit<SpawnSyncOptions, 'stdio'> = {}) {
    const result = spawnSync(
        command,
        args,
        {
            ...options,
            stdio: ['inherit', 'pipe', 'pipe'],
            encoding: 'utf8',
        },
    )

    if (result.status === null || result.status !== 0) {
        throw new CommandError(result)
    }

    return result
}


/**
 * Execute a wp-cli command and return the spawn result when successful.
 */
export function wp(...args: readonly string[]) {
    console.group(`Running wp-cli: ${args.join(' ')}`)
    try {
        const result = spawnSync(
            'wp',
            args,
            {
                stdio: ['inherit', 'pipe', 'pipe'],
                encoding: 'utf8',
            },
        )

        if (result.status === null || result.status !== 0) {
            console.error(result.stderr)
            throw new WPCliError(result.stderr || 'Unknown error occurred while running wp-cli command.')
        }

        return result

    } catch (error) {
        if (error instanceof Error) {
            throw new WPCliError(error.message)
        } else {
            throw error
        }
    } finally {
        console.groupEnd()
    }
}


/**
 * Check whether WordPress is already installed at the provided path.
 */
export function isWordPressInstalled(path: string) {
    const result = spawnSync('wp', ['core', 'is-installed', '--path=' + path, '--skip-plugins', '--skip-themes'], { stdio: 'ignore' })

    return result.status === 0
}


export type InstallWordPressOptions = {
    url: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    dbHost?: string;
    dbPrefix?: string;
    title?: string;
    adminUser?: string;
    adminPassword?: string;
    adminEmail?: string;
    version?: string;
    locale?: string;
    force?: boolean;
}


/**
 * Install a WordPress instance through wp-cli for automated testing.
 *
 * @link https://make.wordpress.org/cli/handbook/how-to/how-to-install/
 */
export function installWordPress(
    path: string,
    {
        /**
         * The URL to access the WordPress instance.
         */
        url,

        /**
         * Database name.
         */
        dbName,

        /**
         * Database user.
         */
        dbUser,

        /**
         * Database password.
         */
        dbPassword,

        /**
         * Database host.
         */
        dbHost = 'localhost',

        /**
         * The table prefix to use when installing WordPress.
         * If not provided, a random prefix will be generated to avoid conflicts when running tests against the same database.
         */
        dbPrefix,

        /**
         * The title of the WordPress site.
         */
        title = 'WordPress e2e Testing',

        /**
         * Administrator username.
         */
        adminUser = 'admin',

        /**
         * Administrator password.
         */
        adminPassword = 'password',

        /**
         * Administrator email.
         */
        adminEmail = 'admin@wordpress.local',

        /**
         * WordPress version.
         */
        version = 'latest',

        /**
         * WordPress locale.
         */
        locale = 'en_US',

        /**
         * Force installation even if WordPress is already installed.
         */
        force = false,
    }: InstallWordPressOptions,
) {
    console.group('Starting WordPress installation...')

    try {
        if (!url) {
            throw new WPInstallError('Site URL is required to install WordPress. Please provide the "url" parameter.')
        }

        if (!dbName || !dbUser || !dbPassword) {
            throw new WPInstallError('Database credentials are required to install WordPress. Please provide dbName, dbUser, and dbPassword.')
        }

        if (!adminUser || !adminPassword || !adminEmail) {
            throw new WPInstallError('Administrator credentials are required to install WordPress. Please provide adminUser, adminPassword, and adminEmail.')
        }

        if (!dbPrefix) {
            while (1) {
                // Generate a random table prefix to avoid conflicts when running tests against the same database.
                dbPrefix = 'wp' + Math.random().toString(36).substring(2, 8) + '_'

                /**
                 * Directly query the database to check if the generated prefix already exists, as a bug in `wp db query`.
                 *
                 * @link https://github.com/wp-cli/db-command/pull/312
                 */
                const result = spawnSync(
                    'mysql',
                    [
                        '-h', dbHost,
                        '-u', dbUser,
                        `-p${dbPassword}`,
                        '-e', `SHOW TABLES LIKE '${dbPrefix}%'`,
                        dbName,
                    ],
                    {
                        stdio: ['inherit', 'pipe', 'pipe'],
                        encoding: 'utf8',
                    },
                )

                if (result.status !== 0) {
                    console.error(result.stderr)
                    throw new WPCliError(result.stderr || 'Unknown error occurred while checking database for existing table prefixes.')
                }

                if (!result.stdout.trim()) {
                    break
                }
            }
        }

        console.debug('Installation parameters', { path, url, dbName, dbUser, dbHost, dbPrefix, title, adminUser, version, locale, force })

        if (isWordPressInstalled(path)) {
            if (!force) {
                throw new WPAlreadyInstalledError('WordPress is already installed.')
            }

            console.warn("\u001b[33mWordPress is already installed. Cleaning files and database...\u001b[0m")

            // https://developer.wordpress.org/cli/commands/db/clean/
            wp('db', 'clean', '--path=' + path, '--defaults', '--yes', '--skip-themes', '--skip-plugins')
            execCommand('rm', ['-rf', join(path, 'wp-content'), join(path, 'wp-includes'), join(path, 'wp-admin')])
        }

        mkdirSync(path, { recursive: true })

        // Step 1 – Download WordPress
        console.info('Downloading WordPress...')
        // https://developer.wordpress.org/cli/commands/core/download/
        const baseInstallArgs = ['--path=' + path, '--skip-content']
        force && baseInstallArgs.push('--force')
        try {
            wp('core', 'download', ...baseInstallArgs, '--version=' + version)
        } catch (error) {
            if (error instanceof WPCliError && error.message.includes('WordPress files seem to already be present here.')) {
                // Retry with `--force`.
                wp('core', 'download', ...baseInstallArgs, '--version=' + version, '--force')
            }
        }

        // Step 2 – Generate a config file
        console.info('Generating wp-config.php...')
        // https://developer.wordpress.org/cli/commands/config/create/
        const configArgs = [
            '--dbname=' + dbName,
            '--dbuser=' + dbUser,
            '--dbpass=' + dbPassword,
            '--dbhost=' + dbHost,
            '--dbprefix=' + dbPrefix,
        ]
        try {
            wp('config', 'create',
                '--path=' + path,
                ...configArgs,
            )
        } catch (error) {
            if (error instanceof WPCliError && error.message.includes('The \'wp-config.php\' file already exists.')) {
                // Retry with `--force`.
                wp('config', 'create',
                    '--path=' + path,
                    ...configArgs,
                    '--force'
                )
            }
        }

        // // Step 3 – Create the database
        // console.info('Creating database...')
        // // https://developer.wordpress.org/cli/commands/db/create/
        // wp('db', 'create', '--path=' + path, '--defaults')

        // Step 4 – Install WordPress
        console.info('Installing WordPress...')
        // https://developer.wordpress.org/cli/commands/core/install/
        wp('core', 'install',
            '--path=' + path,
            '--url=' + url,
            '--title=' + title,
            '--admin_user=' + adminUser,
            '--admin_password=' + adminPassword,
            '--admin_email=' + adminEmail,
            '--locale=' + locale,
            '--skip-email',
        )

        // Step 5 - wp language core install $locale --activate ; wp site switch-language $locale
        wp('language', 'core', 'install', locale, '--activate', '--path=' + path)
        wp('site', 'switch-language', locale, '--path=' + path)

        console.info("\u001b[32mWordPress installed successfully.\u001b[0m")

    } finally {
        console.groupEnd()
    }
}


/**
 * Resolve ABSPATH for an installed instance.
 */
export function getInstalledRootDirectory(path: string) {
    const lastWorkdir = process.cwd()

    chdir(path)

    try {
        return wp('eval', '--skip-plugins', '--skip-themes', 'echo ABSPATH;').stdout.trim()

    } finally {
        chdir(lastWorkdir)
    }
}


/**
 * Return the absolute path to the active wp-config.php for an instance.
 */
export function getInstanceConfigPath(path: string) {
    const result = wp('config', 'path', '--path=' + path, '--skip-plugins', '--skip-themes')
    return result.stdout.trim()
}


/**
 * Read wp-config constants and return them as a name/value map.
 */
export function getInstanceConfigValues(path: string) {
    const result = wp('config', 'list', '--path=' + path, '--skip-plugins', '--skip-themes', '--format=json')

    return JSON.parse(result.stdout.trim()).reduce((acc: Record<string, string>, { name, value }: { name: string, value: string }) => {
        acc[name] = value
        return acc
    }, {}) as Record<string, string>
}


/**
 * List installed plugins for the target WordPress instance.
 */
export function getInstanceInstalledPlugins(path: string) {
    const result = wp('plugin', 'list', '--path=' + path, '--skip-plugins', '--skip-themes', '--format=json')
    return JSON.parse(result.stdout.trim())
}


/**
 * List installed themes for the target WordPress instance.
 */
export function getInstanceInstalledThemes(path: string) {
    const result = wp('theme', 'list', '--path=' + path, '--skip-plugins', '--skip-themes', '--format=json')
    return JSON.parse(result.stdout.trim())
}


/**
 * Collect common runtime and configuration details for a WordPress instance.
 */
export function getInstanceParameters(path: string) {
    const abspath = wp('eval', '--path=' + path, '--skip-plugins', '--skip-themes', 'echo ABSPATH;').stdout.trim()
    const version = wp('core', 'version', '--path=' + path, '--skip-plugins', '--skip-themes').stdout.trim()
    const locale = wp('option', 'get', 'WPLANG', '--path=' + path, '--skip-plugins', '--skip-themes').stdout.trim()
    const url = wp('option', 'get', 'siteurl', '--path=' + path, '--skip-plugins', '--skip-themes').stdout.trim()
    const title = wp('option', 'get', 'blogname', '--path=' + path, '--skip-plugins', '--skip-themes').stdout.trim()
    const adminEmail = wp('option', 'get', 'admin_email', '--path=' + path, '--skip-plugins', '--skip-themes').stdout.trim()
    const config = getInstanceConfigValues(path)
    const plugins = getInstanceInstalledPlugins(path)
    const themes = getInstanceInstalledThemes(path)

    return {
        abspath,
        version,
        locale,
        url,
        title,
        dbHost: config.DB_HOST,
        dbName: config.DB_NAME,
        dbUser: config.DB_USER,
        dbPassword: config.DB_PASSWORD,
        adminEmail,
        config,
        plugins,
        themes,
    }
}


/**
 * Try enabling "debug.log" with settings that seem useful for e2e testing.
 */
export async function enableDebugLog(path: string) {
    const wpConfigPath = getInstanceConfigPath(path)
    const wpConfigContent = await fs.readFile(wpConfigPath, 'utf-8')
    const newWpConfigContent = wpConfigContent.replace(
        '/* That\'s all, stop editing! Happy publishing. */',
        function (match) {
            return `
error_reporting( E_ALL & ~E_NOTICE & ~E_STRICT & ~E_DEPRECATED & ~E_WARNING & ~E_USER_WARNING & ~E_USER_NOTICE & ~E_USER_DEPRECATED );
set_exception_handler( '\error_log' );
$GLOBALS['wp_filter']['wp_login_errors'][10][] = array(
	'accepted_args' => 2,
	'function'      => function ( $errors, $redirect_to ) {
		error_log( 'Login error: ' . print_r( $errors, true ) . ' Redirect to: ' . $redirect_to );
		return $errors;
	},
);
` + match
        },
    )
    // Write back to wp-config.php
    await fs.writeFile(wpConfigPath, newWpConfigContent, 'utf-8')

    // wp('config', 'set', 'WP_DEBUG', 'true', '--raw', '--path=' + path)
    wp('config', 'set', 'WP_DEBUG_LOG', 'true', '--raw', '--path=' + path)
    wp('config', 'set', 'WP_DEBUG_DISPLAY', 'false', '--raw', '--path=' + path)
}
