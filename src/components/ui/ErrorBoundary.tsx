import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';
import { reportClientError } from '../../core/utils/errorReporting';

interface Props {
  children: ReactNode;
  moduleName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, {
      module: this.props.moduleName ?? 'app',
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const label = this.props.moduleName ?? 'هذه الشاشة';

    return (
      <div
        className="workspace"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '320px',
          gap: 'var(--spacing-4)',
          padding: 'var(--spacing-6)',
          textAlign: 'center',
        }}
        role="alert"
      >
        <h2 style={{ margin: 0, color: 'var(--color-danger)' }}>حدث خطأ غير متوقع</h2>
        <p style={{ maxWidth: '480px', color: 'var(--color-text-secondary)', margin: 0 }}>
          {label} توقف مؤقتاً بسبب خطأ داخلي. بياناتك محفوظة — يمكنك إعادة المحاولة أو تحديث الصفحة.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          <Button variant="primary" onClick={this.handleRetry}>
            إعادة المحاولة
          </Button>
          <Button variant="secondary" onClick={this.handleReload}>
            تحديث الصفحة
          </Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
