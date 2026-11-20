import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}

/** 想定外の例外で画面全体が停止しないようにする（NFR-09） */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card issue error" role="alert">
          ⛔ {this.props.label ?? 'この部分'}の表示中にエラーが発生しました：{this.state.error.message}
          <div>
            <button type="button" onClick={() => this.setState({ error: null })}>
              再表示を試す
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
