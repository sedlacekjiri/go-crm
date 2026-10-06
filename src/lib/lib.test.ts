import { describe, expect, it } from "vitest";
import { bucketKeys, revenueByPartner, revenueSeries, totals, weekStart } from "./analytics";
import { convert, rateOn } from "./fx";
import { buildSales, guessMapping, parseDate, parseNumber } from "./import";
import type { Partner, Sale } from "./types";

describe("parseNumber", () => {
  it.each([
    ["1234", 1234],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["45.000", 45000],
    ["45,000", 45000],
    ["12,5", 12.5],
    ["12.50", 12.5],
    ["€ 1 234", 1234],
    ["185.400 kr", 185400],
    ["1.234.567", 1234567],
    ["-80,00", -80],
    ["", null],
    ["n/a", null],
    [99.9, 99.9],
  ])("%s → %s", (input, expected) => expect(parseNumber(input)).toBe(expected));
});

describe("parseDate", () => {
  it("handles ISO, European and US formats", () => {
    expect(parseDate("2026-10-06")).toBe("2026-10-06");
    expect(parseDate("2026-10-06 14:22:00")).toBe("2026-10-06");
    expect(parseDate("06.10.2026")).toBe("2026-10-06");
    expect(parseDate("6/10/2026")).toBe("2026-10-06");
    expect(parseDate("10/6/2026", "mdy")).toBe("2026-10-06");
    expect(parseDate("13/25/2026")).toBeNull();
    expect(parseDate("12/25/2026")).toBe("2026-12-25"); // day-first impossible → month-first
    expect(parseDate(46301)).toBe("2026-10-06"); // Excel serial
    expect(parseDate("garbage")).toBeNull();
  });
});

describe("guessMapping", () => {
  it("maps typical export headers", () => {
    const m = guessMapping(["Booking No", "Created", "Pickup date", "Return date", "Total price", "Currency", "Affiliate", "Status", "Vehicle"]);
    expect(m).toMatchObject({
      booking_ref: "Booking No",
      booking_date: "Created",
      pickup_date: "Pickup date",
      return_date: "Return date",
      amount: "Total price",
      currency: "Currency",
      affiliate_code: "Affiliate",
      status: "Status",
      vehicle: "Vehicle",
    });
  });
});

describe("buildSales", () => {
  const mapping = { booking_ref: "Ref", booking_date: "Created", amount: "Total", pickup_date: "From", return_date: "To", status: "Status", vehicle: "Car" } as const;
  it("parses rows, computes days, flags cancellations and reports errors", () => {
    const { sales, errors } = buildSales(
      [
        { Ref: "A1", Created: "01.10.2026", Total: "1.200,00", From: "2026-11-01", To: "2026-11-05", Status: "Confirmed", Car: "Toyota RAV4" },
        { Ref: "A2", Created: "02.10.2026", Total: "900", From: "", To: "", Status: "Cancelled", Car: "VW Camper California" },
        { Ref: "", Created: "02.10.2026", Total: "900" },
        { Ref: "A3", Created: "nope", Total: "900" },
        { Ref: "A1", Created: "01.10.2026", Total: "1.300,00", From: "2026-11-01", To: "2026-11-05", Status: "Confirmed", Car: "Toyota RAV4" },
        { Ref: "", Created: "", Total: "" },
      ],
      mapping,
      { dateFormat: "auto", defaultCurrency: "EUR", brandMode: "column" },
    );
    expect(errors.map((e) => e.row)).toEqual([4, 5]);
    expect(sales).toHaveLength(2);
    expect(sales[0]).toMatchObject({ booking_ref: "A1", amount: 1300, rental_days: 4, brand: "car", is_cancelled: false, currency: "EUR" });
    expect(sales[1]).toMatchObject({ booking_ref: "A2", brand: "camper", is_cancelled: true });
  });
});

describe("fx", () => {
  const rates = { "2026-10-02": { ISK: 140, USD: 1.1 }, "2026-10-05": { ISK: 138, USD: 1.2 } };
  it("uses the latest earlier rate on weekends", () => {
    expect(rateOn(rates, "2026-10-04", "ISK")).toBe(140);
    expect(rateOn(rates, "2026-10-05", "ISK")).toBe(138);
    expect(rateOn(rates, "2026-10-09", "ISK")).toBe(138);
  });
  it("converts EUR, ISK and other currencies", () => {
    expect(convert(100, "EUR", "2026-10-05", rates)).toEqual({ amount_eur: 100, amount_isk: 13800, fx_eur_isk: 138 });
    expect(convert(27600, "ISK", "2026-10-05", rates)).toMatchObject({ amount_eur: 200, amount_isk: 27600 });
    expect(convert(120, "USD", "2026-10-05", rates)).toMatchObject({ amount_eur: 100, amount_isk: 13800 });
  });
});

describe("analytics", () => {
  const sale = (over: Partial<Sale>): Sale => ({
    id: Math.random().toString(),
    booking_ref: "x",
    booking_date: "2026-10-01",
    pickup_date: null,
    return_date: null,
    brand: "car",
    vehicle: null,
    rental_days: 3,
    amount: 100,
    currency: "EUR",
    amount_eur: 100,
    amount_isk: 14000,
    fx_eur_isk: 140,
    affiliate_code: null,
    status: null,
    is_cancelled: false,
    customer_country: null,
    ...over,
  });

  it("buckets weeks from Monday and fills empty buckets", () => {
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(bucketKeys("2026-11-15", "2027-02-01", "month")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    const s = revenueSeries([sale({ booking_date: "2026-10-02" }), sale({ booking_date: "2026-10-02", brand: "camper", amount_eur: 50 })], "2026-10-01", "2026-10-03", "day", "EUR");
    expect(s).toEqual([
      { key: "2026-10-01", car: 0, camper: 0, bookings: 0 },
      { key: "2026-10-02", car: 100, camper: 50, bookings: 2 },
      { key: "2026-10-03", car: 0, camper: 0, bookings: 0 },
    ]);
  });

  it("excludes cancelled bookings and attributes partners case-insensitively", () => {
    const partners = [{ id: "p1", name: "Hotel Borg", affiliate_code: "BORG" } as Partner];
    const sales = [sale({ affiliate_code: "borg " }), sale({ affiliate_code: "BORG", amount_isk: 28000 }), sale({ is_cancelled: true }), sale({ affiliate_code: "unknown" })];
    expect(totals(sales, "ISK")).toMatchObject({ revenue: 56000, bookings: 3, cancelled: 1 });
    const rows = revenueByPartner(sales, partners, "ISK");
    expect(rows[0]).toMatchObject({ bookings: 2, revenue: 42000 });
    expect(rows[0].partner?.name).toBe("Hotel Borg");
    expect(rows[1].partner).toBeNull();
  });
});
