import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { I18nProvider, useI18n, LanguagePicker } from "../src/lib/i18n";

describe("i18n multilingual support", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("defaults to English and supports translation with interpolation", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    expect(result.current.lang).toBe("en");
    expect(result.current.t("nav.home")).toBe("Home");
    expect(result.current.t("emergency.callContact", { name: "Ravi" })).toBe("📞 Call Ravi");
    expect(result.current.t("tier.1.title")).toBe("Level 1 · Public");
  });

  it("switches to Hindi and translates strings correctly", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    act(() => {
      result.current.setLang("hi");
    });
    expect(result.current.lang).toBe("hi");
    expect(result.current.t("nav.emergency")).toBe("आपातकालीन");
    expect(result.current.t("emergency.callContact", { name: "रवि" })).toBe("📞 रवि को कॉल करें");
    expect(result.current.t("tier.1.title")).toBe("स्तर 1 · सार्वजनिक");
    expect(result.current.t("qr.title")).toBe("🛡️ स्कैन जोखिम");
    expect(result.current.t("ai.heartAttack")).toBe("दिल का दौरा");
    expect(localStorage.getItem("veap_lang")).toBe("hi");
  });

  it("switches to Marathi and translates strings correctly", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    act(() => {
      result.current.setLang("mr");
    });
    expect(result.current.lang).toBe("mr");
    expect(result.current.t("nav.emergency")).toBe("आपत्कालीन");
    expect(result.current.t("emergency.callContact", { name: "रवी" })).toBe("📞 रवी यांना कॉल करा");
    expect(result.current.t("tier.1.title")).toBe("स्तर १ · सार्वजनिक");
    expect(result.current.t("qr.title")).toBe("🛡️ स्कॅन जोखीम");
    expect(result.current.t("ai.heartAttack")).toBe("हार्ट अटॅक");
    expect(localStorage.getItem("veap_lang")).toBe("mr");
  });

  it("LanguagePicker renders buttons for English, Hindi, and Marathi and changes language on click", () => {
    function AppHarness() {
      const { t, lang } = useI18n();
      return (
        <div>
          <LanguagePicker />
          <span data-testid="current-lang">{lang}</span>
          <span data-testid="label">{t("nav.emergency")}</span>
        </div>
      );
    }
    render(
      <I18nProvider>
        <AppHarness />
      </I18nProvider>
    );

    expect(screen.getByRole("button", { name: /English/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("label")).toHaveTextContent("Emergency");

    // Click Hindi
    fireEvent.click(screen.getByTitle("Hindi"));
    expect(screen.getByTestId("current-lang")).toHaveTextContent("hi");
    expect(screen.getByTestId("label")).toHaveTextContent("आपातकालीन");

    // Click Marathi
    fireEvent.click(screen.getByTitle("Marathi"));
    expect(screen.getByTestId("current-lang")).toHaveTextContent("mr");
    expect(screen.getByTestId("label")).toHaveTextContent("आपत्कालीन");
  });
});
