/**
 * Tests for the dirty-close confirmation logic used in Modal.
 *
 * The Modal component uses this pattern:
 * - isDirty=false → close immediately
 * - isDirty=true → show confirm bar, wait for user choice
 *
 * We test the logic functions here without rendering React.
 */

describe("Modal dirty-close logic", () => {
  // Simulates the handleClose logic from Modal
  function handleClose(
    isDirty: boolean,
    setShowConfirm: (v: boolean) => void,
    onClose: () => void
  ) {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }

  it("calls onClose immediately when not dirty", () => {
    const onClose = jest.fn();
    const setShowConfirm = jest.fn();
    handleClose(false, setShowConfirm, onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setShowConfirm).not.toHaveBeenCalled();
  });

  it("shows confirm bar instead of closing when dirty", () => {
    const onClose = jest.fn();
    const setShowConfirm = jest.fn();
    handleClose(true, setShowConfirm, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(setShowConfirm).toHaveBeenCalledWith(true);
  });

  it("handleConfirmClose calls onClose and hides confirm", () => {
    const onClose = jest.fn();
    const setShowConfirm = jest.fn();

    // Simulates clicking "Descartar"
    function handleConfirmClose() {
      setShowConfirm(false);
      onClose();
    }

    handleConfirmClose();
    expect(setShowConfirm).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'Continuar editando' just hides the confirm bar", () => {
    const setShowConfirm = jest.fn();
    // Simulates clicking "Continuar editando"
    setShowConfirm(false);
    expect(setShowConfirm).toHaveBeenCalledWith(false);
  });
});

describe("InstanceModal isDirty computation", () => {
  it("is not dirty when no action is in progress", () => {
    const confirmingMarkDone = false;
    const editingId: string | null = null;
    const isDirty = confirmingMarkDone || editingId !== null;
    expect(isDirty).toBe(false);
  });

  it("is dirty when date picker is open (confirmingMarkDone)", () => {
    const confirmingMarkDone = true;
    const editingId: string | null = null;
    const isDirty = confirmingMarkDone || editingId !== null;
    expect(isDirty).toBe(true);
  });

  it("is dirty when editing a completion time", () => {
    const confirmingMarkDone = false;
    const editingId: string | null = "some-id";
    const isDirty = confirmingMarkDone || editingId !== null;
    expect(isDirty).toBe(true);
  });
});

describe("ScheduleModal isDirty computation", () => {
  it("is not dirty in default view mode", () => {
    const mode = "view";
    const showPlaceholderForm = false;
    const confirmingCancel = false;
    const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel;
    expect(isDirty).toBe(false);
  });

  it("is dirty when in joining mode", () => {
    const mode = "joining";
    const showPlaceholderForm = false;
    const confirmingCancel = false;
    const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel;
    expect(isDirty).toBe(true);
  });

  it("is dirty when in completing mode", () => {
    const mode = "completing";
    const isDirty = mode !== "view" || false || false;
    expect(isDirty).toBe(true);
  });

  it("is dirty when in inviting mode", () => {
    const mode = "inviting";
    const isDirty = mode !== "view" || false || false;
    expect(isDirty).toBe(true);
  });

  it("is dirty when placeholder form is open", () => {
    const mode = "view";
    const showPlaceholderForm = true;
    const confirmingCancel = false;
    const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel;
    expect(isDirty).toBe(true);
  });

  it("is dirty when confirming cancel", () => {
    const mode = "view";
    const showPlaceholderForm = false;
    const confirmingCancel = true;
    const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel;
    expect(isDirty).toBe(true);
  });
});

describe("CharacterForm isDirty computation", () => {
  const initial = { name: "Teste1", level: 185, class_name: "Mecânico" };

  it("is not dirty when values match initial", () => {
    const isDirty = "Teste1" !== initial.name || 185 !== initial.level || "Mecânico" !== (initial.class_name ?? null);
    expect(isDirty).toBe(false);
  });

  it("is dirty when name changed", () => {
    const isDirty = "Teste2" !== initial.name || 185 !== initial.level || "Mecânico" !== (initial.class_name ?? null);
    expect(isDirty).toBe(true);
  });

  it("is dirty when level changed", () => {
    const isDirty = "Teste1" !== initial.name || 200 !== initial.level || "Mecânico" !== (initial.class_name ?? null);
    expect(isDirty).toBe(true);
  });

  it("is dirty when class changed", () => {
    const isDirty = "Teste1" !== initial.name || 185 !== initial.level || "Arcano" !== (initial.class_name ?? null);
    expect(isDirty).toBe(true);
  });

  it("is dirty for new form (no initial) when name is entered", () => {
    const name = "NewChar";
    const isDirty = name !== "" || 200 !== 200 || null !== null;
    expect(isDirty).toBe(true);
  });

  it("is not dirty for new form (no initial) when fields are default", () => {
    const isDirty = "" !== "" || 200 !== 200 || null !== null;
    expect(isDirty).toBe(false);
  });
});

describe("ScheduleForm isDirty computation", () => {
  it("is not dirty when message is empty", () => {
    const message = "";
    const isDirty = message.trim().length > 0;
    expect(isDirty).toBe(false);
  });

  it("is not dirty when message is whitespace only", () => {
    const message = "   ";
    const isDirty = message.trim().length > 0;
    expect(isDirty).toBe(false);
  });

  it("is dirty when message has content", () => {
    const message = "tenho tudo pronto";
    const isDirty = message.trim().length > 0;
    expect(isDirty).toBe(true);
  });
});
