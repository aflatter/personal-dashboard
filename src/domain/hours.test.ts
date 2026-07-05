import { describe, expect, it } from "vitest";
import { hoursView } from "./hours";
import type { Client } from "./types";

const clients: Client[] = [
  {
    name: "Hansequartier",
    projects: [
      { name: "Website Relaunch", hours: 18.5 },
      { name: "Exposé-Texte", hours: 5 },
    ],
  },
  {
    name: "Nordlicht",
    projects: [
      { name: "App MVP", hours: 24 },
      { name: "Code Review", hours: 4.5 },
    ],
  },
];

describe("hoursView", () => {
  const view = hoursView(clients);

  it("totals each client and the whole month numerically", () => {
    expect(view.clients[0].total).toBe(23.5); // 18.5 + 5
    expect(view.clients[1].total).toBe(28.5); // 24 + 4.5
    expect(view.monthTotal).toBe(52);
    expect(view.clientCount).toBe(2);
  });

  it("sizes stacked-bar segments as shares of the client total", () => {
    expect(view.clients[0].segments[0].width).toBe("78.7%"); // 18.5 / 23.5
    expect(view.clients[0].segments[1].width).toBe("21.3%"); // 5 / 23.5
  });

  it("tags each project with its client index and tint level", () => {
    expect(view.clients[0].projects[0]).toMatchObject({
      clientIndex: 0,
      tintLevel: 0,
      hours: 18.5,
    });
    expect(view.clients[0].projects[1]).toMatchObject({ clientIndex: 0, tintLevel: 1, hours: 5 });
    expect(view.clients[1].projects[0]).toMatchObject({ clientIndex: 1, tintLevel: 0 });
  });
});
