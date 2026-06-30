import type { Bank, Client, Inbox, Settings } from '../domain';
import { DAY, DEFAULT_SETTINGS } from '../domain';

/** Full persisted dashboard state. Real integrations would replace the seed. */
export interface DashboardState {
  emails: { personal: Inbox; work: Inbox };
  clients: Client[];
  rentDoneAt: number;
  taxDoneAt: number;
  bank: Bank;
  lastSyncAt: number;
  settings: Settings;
}

/** Seeded mock data mirroring the design prototype, relative to `now`. */
export function createSeed(now: number): DashboardState {
  return {
    emails: {
      personal: {
        account: 'personal',
        email: 'alex@flatter.io',
        protocol: 'IMAP',
        total: 47,
        unread: 12,
        history: [10, 13, 9, 12, 15, 11, 14, 12, 16, 13, 12],
        totalHistory: [44, 47, 43, 46, 48, 45, 47, 46, 49, 47, 47],
      },
      work: {
        account: 'work',
        email: 'alex@tevim.com',
        protocol: 'Exchange',
        total: 138,
        unread: 23,
        history: [22, 26, 21, 28, 24, 23, 27, 25, 29, 24, 23],
        totalHistory: [132, 136, 130, 138, 134, 133, 137, 135, 140, 138, 138],
      },
    },
    clients: [
      { name: 'Hansequartier', projects: [
        { name: 'Website Relaunch', hours: 18.5 },
        { name: 'Exposé-Texte', hours: 5 },
      ] },
      { name: 'Nordlicht', projects: [
        { name: 'App MVP', hours: 24 },
        { name: 'Code Review', hours: 4.5 },
      ] },
      { name: 'intern', projects: [
        { name: 'Buchhaltung', hours: 3 },
        { name: 'Akquise', hours: 6 },
      ] },
    ],
    rentDoneAt: now - 12 * DAY,
    taxDoneAt: now - 26 * DAY,
    bank: { unchecked: 34, lastCheckedAt: now - 5 * DAY },
    lastSyncAt: now - 12_000,
    settings: DEFAULT_SETTINGS,
  };
}
