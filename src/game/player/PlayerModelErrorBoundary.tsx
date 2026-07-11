import { Component, type ErrorInfo, type ReactNode } from "react";

export class PlayerModelErrorBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}, {
  failed: boolean;
}> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Không thể tải model người chơi, đang dùng model dự phòng.", error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
