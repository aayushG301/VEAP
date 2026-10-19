import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TagInput } from "../src/components/TagInput";
import { OtpBoxes } from "../src/components/OtpBoxes";
import { Modal } from "../src/components/Modal";
import { VisibilityPicker } from "../src/components/VisibilityPicker";

describe("TagInput", () => {
  function Harness() { const [v, setV] = useState<string[]>([]); return <TagInput label="Allergies" id="al" value={v} onChange={setV} />; }
  it("adds tags with Enter and comma, ignores duplicates, removes with × and Backspace", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Allergies");
    fireEvent.change(input, { target: { value: "Penicillin" } }); fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "Peanuts," } });
    fireEvent.change(input, { target: { value: "penicillin" } }); fireEvent.keyDown(input, { key: "Enter" }); // duplicate (case-insensitive)
    expect(screen.getByText("Penicillin")).toBeInTheDocument(); expect(screen.getByText("Peanuts")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Remove/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove Penicillin" }));
    expect(screen.queryByText("Penicillin")).toBeNull();
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(screen.queryByText("Peanuts")).toBeNull();
  });
  it("adds pending text on blur", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Allergies");
    fireEvent.change(input, { target: { value: "Latex" } }); fireEvent.blur(input);
    expect(screen.getByText("Latex")).toBeInTheDocument();
  });
});

describe("OtpBoxes", () => {
  function Harness({ done }: { done: (v: string) => void }) { const [v, setV] = useState(""); return <OtpBoxes value={v} onChange={setV} onComplete={done} />; }
  it("accepts typing digit by digit and completes at 6", () => {
    const done = vi.fn();
    render(<Harness done={done} />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(6);
    "123456".split("").forEach((d, i) => fireEvent.change(boxes[i], { target: { value: d } }));
    expect(done).toHaveBeenCalledWith("123456");
  });
  it("accepts a pasted code and ignores non-digits", () => {
    const done = vi.fn();
    render(<Harness done={done} />);
    const boxes = screen.getAllByRole("textbox");
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => "98 76-54" } });
    expect(done).toHaveBeenCalledWith("987654");
    expect((boxes[0] as HTMLInputElement).value).toBe("9");
  });
  it("backspace removes a digit", () => {
    render(<Harness done={() => undefined} />);
    const boxes = screen.getAllByRole("textbox");
    fireEvent.change(boxes[0], { target: { value: "1" } }); fireEvent.change(boxes[1], { target: { value: "2" } });
    fireEvent.keyDown(boxes[1], { key: "Backspace" });
    expect((boxes[1] as HTMLInputElement).value).toBe("");
    expect((boxes[0] as HTMLInputElement).value).toBe("1");
  });
});

describe("Modal", () => {
  it("closes on Escape and on background click, and stays closed when not open", () => {
    const onClose = vi.fn();
    const { rerender, container } = render(<Modal open title="Hello" onClose={onClose}><p>body</p></Modal>);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.ownerDocument.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Modal open={false} title="Hello" onClose={onClose}><p>body</p></Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("regression: re-rendering with a new onClose must not steal focus from the field being typed in", async () => {
    function Harness() {
      const [a, setA] = useState(""); const [b, setB] = useState("");
      return <Modal open title="Two fields" onClose={() => undefined}>
        <input aria-label="first" value={a} onChange={(e) => setA(e.target.value)} />
        <input aria-label="second" value={b} onChange={(e) => setB(e.target.value)} />
      </Modal>;
    }
    render(<Harness />);
    await new Promise((r) => setTimeout(r, 60)); // the one-time initial focus happens here
    const second = screen.getByLabelText("second") as HTMLInputElement;
    second.focus();
    fireEvent.change(second, { target: { value: "123456" } }); // triggers a re-render with a fresh onClose identity
    await new Promise((r) => setTimeout(r, 80));
    expect(document.activeElement).toBe(second);
  });
});

describe("VisibilityPicker", () => {
  it("shows the current level and reports changes", () => {
    const onChange = vi.fn();
    render(<VisibilityPicker label="medications" value={2} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Verified/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Public/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
