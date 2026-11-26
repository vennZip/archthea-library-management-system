import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal, ConfirmDialog } from "./Modal";

describe("accessible dialogs", () => {
  it("names the dialog, traps focus, restores it and supports Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Open dialog";
    document.body.append(trigger);
    trigger.focus();
    const view = render(
      <Modal title="Edit a book" onClose={onClose}>
        <input aria-label="Title" />
        <button>Save</button>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Edit a book" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
  it("keeps focus while form state changes", async () => {
    const user = userEvent.setup();
    function Form() {
      const [value, setValue] = React.useState("");
      return (
        <Modal title="Form" onClose={() => {}}>
          <input
            aria-label="Name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Modal>
      );
    }
    render(<Form />);
    await user.type(screen.getByLabelText("Name"), "Christian");
    expect(screen.getByLabelText("Name")).toHaveValue("Christian");
  });
  it("disables confirmation while a mutation is pending", () => {
    render(
      <ConfirmDialog
        title="Return a book?"
        message="Confirm the condition."
        pending
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
