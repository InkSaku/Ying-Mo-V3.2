import { Component } from "react";
import { ErrorState } from "./States";

const FRIENDLY_ERROR = { message: "页面没能打开，可能是刚刚有过更新。重新加载后通常就能恢复。" };

export class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("页面渲染失败", error, info.componentStack);
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page-shell">
        <ErrorState error={FRIENDLY_ERROR} onRetry={() => window.location.reload()} />
      </main>
    );
  }
}
