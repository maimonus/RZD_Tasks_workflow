import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Intentionally empty: UI surface is enough for demo.
  }

  render() {
    if (this.state.error) {
      return (
        <div className="space-y-4 rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-rose-800 shadow-sm">
          <h2 className="text-lg font-semibold">Ошибка в интерфейсе</h2>
          <p className="text-sm text-rose-700">
            Страница не смогла отрисоваться из-за runtime-ошибки. Сообщение:
          </p>
          <pre className="overflow-auto rounded-2xl bg-white/70 p-4 text-xs text-rose-900">
            {this.state.error.message}
          </pre>
          <button
            className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => this.setState({ error: null })}
            type="button"
          >
            Попробовать снова
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

