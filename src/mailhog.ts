import type { Page } from '@playwright/test';
// @ts-ignore
import { unescapeFromMime } from './strutil.lib.js';


const MAILHOG_API_ENDPOINT = 'http://mailhog:8025/api/v1/messages';


export type MailAddress = {
    Mailbox: string;
    Domain: string;
    Params: string;
};


export type MailMessage = {
    ID: string;
    From: MailAddress;
    To: Array<MailAddress>;
    Content: {
        Headers: {
            'Content-Transfer-Encoding'?: Array<string>;
            'Content-Type'?: Array<string>;
            Date?: Array<string>;
            From?: Array<string>;
            'MIME-Version'?: Array<string>;
            'Message-ID'?: Array<string>;
            Subject?: Array<string>;
            To?: Array<string>;
            Received?: Array<string>;
            'Return-Path'?: Array<string>;
            'X-Mailer'?: Array<string>;
            //   [key: string]: Array<string>;
        },
        Body: string;
        Size: number;
        MIME?: string | null;
    },
    Created: string;
    MIME?: string | null;
    Raw: {
        From: string;
        To: Array<string>;
        Data: string;
        Helo: string;
    },
};


export async function getSentMails(page: Page): Promise<Array<MailMessage>> {
    const response = await page.request.get(MAILHOG_API_ENDPOINT);
    const result = await response.json();

    result.forEach((message: MailMessage) => {
        // Decode MIME encoded headers.
        for (const key of ['From', 'To', 'Subject'] as const) {
            if (message.Content.Headers[key]) {
                message.Content.Headers[key] = message.Content.Headers[key]!.map(unescapeFromMime);
            }
        }
    });

    return result;
}


export async function findSentMail(page: Page, predicate: (mail: MailMessage) => boolean): Promise<MailMessage | undefined> {
    const messages = await getSentMails(page);

    return messages.find(predicate);
}


export async function clearSentMails(page: Page) {
    const response = await page.request.delete(MAILHOG_API_ENDPOINT);

    if (!response.ok()) {
        throw new Error('Failed to clear sent mails.');
    }
}
