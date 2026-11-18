import type { ModalFuncProps } from "antd";
import type { useAppProps } from "antd/es/app/context";

// A confirm dialog as a promise: true on OK, false on Cancel.
export function confirmAsync(modal: useAppProps["modal"], props: Omit<ModalFuncProps, "onOk" | "onCancel">): Promise<boolean> {
  return new Promise((resolve) => modal.confirm({ ...props, onOk: () => resolve(true), onCancel: () => resolve(false) }));
}
