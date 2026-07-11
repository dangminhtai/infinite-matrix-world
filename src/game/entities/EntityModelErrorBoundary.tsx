import { Component, type ErrorInfo, type ReactNode } from "react";

export class EntityModelErrorBoundary extends Component<{
  children: ReactNode;
}, {
  failed: boolean;
}> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Không thể tải model entity, đang dùng hình học dự phòng.", error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
