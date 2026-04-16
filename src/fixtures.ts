import type {
    TestType,
    PlaywrightTestArgs,
    PlaywrightTestOptions,
    PlaywrightWorkerArgs,
    PlaywrightWorkerOptions,
} from '@playwright/test'
import { RequestUtils, PageUtils, Editor, Admin } from '@wordpress/e2e-test-utils-playwright'  // https://github.com/WordPress/gutenberg/tree/trunk/packages/e2e-test-utils-playwright


export function extendTestWithFixtures(
    test: TestType<
        PlaywrightTestArgs & PlaywrightTestOptions,
        PlaywrightWorkerArgs & PlaywrightWorkerOptions
    >
) {
    // https://playwright.dev/docs/auth#authenticate-with-api-request

    return test.extend<
        {
            admin: Admin;
            requestUtils: RequestUtils;
        }
    >({
        storageState: async ({ baseURL }, use, testInfo) => {
            const storageStatePath = testInfo.outputPath('wp-auth.json')

            const requestUtils = await RequestUtils.setup({
                baseURL,  // may be "http://localhost/.e2etest/"
                storageStatePath,
                user: {
                    username: process.env.WP_USERNAME || 'admin',
                    password: process.env.WP_PASSWORD || 'password',
                },
            })

            await requestUtils.setupRest()  // NOTE: REST nonce endpoint returns same value for hours.

            await use(storageStatePath)
        },

        admin: async ({ page, browserName }, use) => {
            const pageUtils = new PageUtils({ page, browserName })
            const editor = new Editor({ page })
            const admin = new Admin({ page, pageUtils, editor })

            await use(admin)
        },

        requestUtils: async ({ request, baseURL, storageState }, use) => {
            const requestUtils = new RequestUtils(request, {
                baseURL,
                storageStatePath: typeof storageState === 'string' ? storageState : undefined,
                user: {
                    username: process.env.WP_USERNAME || 'admin',
                    password: process.env.WP_PASSWORD || 'password',
                },
            })

            await use(requestUtils)
        },
    })
}
