import { describe, expect, it, beforeEach } from "vitest";
import { ageFrom, deviceName, formatCountdown, fromList, initials, loadTier1, saveTier1, timeAgo, toList } from "../src/lib/util";
import { strength } from "../src/components/AuthShell";

describe("util", () => {
  beforeEach(() => localStorage.clear());
  it("parses lists from newlines and commas", () => {
    expect(toList("Penicillin, Latex\n Peanuts \n\n")).toEqual(["Penicillin", "Latex", "Peanuts"]);
    expect(fromList(["a", "b"])).toBe("a\nb");
    expect(fromList(undefined)).toBe("");
  });
  it("formats countdowns", () => {
    expect(formatCountdown(300000)).toBe("5:00");
    expect(formatCountdown(61000)).toBe("1:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });
  it("formats relative times", () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(timeAgo(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(timeAgo(now - 2 * 86400_000, now)).toBe("2 d ago");
  });
  it("computes age from date of birth", () => {
    const now = new Date("2026-06-15");
    expect(ageFrom("1990-06-16", now)).toBe(35);
    expect(ageFrom("1990-06-15", now)).toBe(36);
    expect(ageFrom("nonsense", now)).toBeNull();
    expect(ageFrom(undefined, now)).toBeNull();
  });
  it("turns user agents into friendly device names", () => {
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe("Safari on iOS");
    expect(deviceName(undefined)).toBe("Unknown device");
  });
  it("makes initials", () => { expect(initials("Asha Verma")).toBe("AV"); expect(initials("")).toBe("?"); });
  it("caches and restores Level 1 data for offline use", () => {
    expect(loadTier1("t")).toBeNull();
    saveTier1("t", { data: { bloodGroup: "O-" } });
    expect(loadTier1("t")!.data.data.bloodGroup).toBe("O-");
  });
  it("scores password strength", () => {
    expect(strength("abc").score).toBeLessThan(2);
    expect(strength("Str0ng-Passw0rd-Long!").score).toBe(5);
    expect(strength("Abcdefghi1").checks.every((c) => c.ok)).toBe(true);
  });
});
