import { summarizeTraffic } from "../../libs/site-traffic";

const day = (date: string, visitors: number) => ({ date, visitors, pageViews: visitors * 2, requests: visitors * 10 });

describe("summarizeTraffic", () => {
  const daily = [day("2026-10-20", 10), day("2026-10-21", 20), day("2026-10-22", 30)];
  const breakdown = [
    { date: "2026-10-21", countries: [{ code: "GB", requests: 5 }, { code: "US", requests: 9 }], browsers: [{ name: "Chrome", pageViews: 4 }] },
    { date: "2026-10-22", countries: [{ code: "GB", requests: 7 }], browsers: [{ name: "Chrome", pageViews: 1 }, { name: "Safari", pageViews: 3 }] },
  ];

  it("totals only the chosen range and ranks countries and browsers", () => {
    const v = summarizeTraffic(daily, breakdown, 2);
    expect(v.rows).toHaveLength(2);
    expect(v.today).toBe(30);
    expect(v.pageViews).toBe(100);
    expect(v.requests).toBe(500);
    expect(v.countries).toEqual([["GB", 12], ["US", 9]]);
    expect(v.browsers).toEqual([["Chrome", 5], ["Safari", 3]]);
  });

  it("uses every day for all time", () => {
    expect(summarizeTraffic(daily, breakdown, null).rows).toHaveLength(3);
  });
});
