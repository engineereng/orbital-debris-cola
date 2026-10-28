"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class VizErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="state error" role="alert">
            <strong>3D view unavailable.</strong>{" "}
            {this.state.error.message || "WebGL context failed."} Strip, slider, and
            approach table still work — try another browser or GPU.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
