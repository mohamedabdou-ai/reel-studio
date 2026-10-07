import React from "react";

type Props = { label: string;                                                                        resetKey?: unknown; children?: React.ReactNode };

export class Boundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="boundary" role="alert" dir="ltr">
        <strong>{this.props.label}</strong>
        <pre>{error.message}</pre>
        <button type="button" onClick={() => this.setState({ error: null })}>حاول تاني</button>
      </div>
    );
  }
}
