// Core Logging Module
// Professional structured logging for production environments

use std::sync::Once;

static INIT: Once = Once::new();

/// Log level enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    #[cfg(test)]
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }
}

/// Initialize logging for the application
pub fn init_logging() {
    INIT.call_once(|| {
        #[cfg(debug_assertions)]
        {
            tracing::info!(target: "app", "FlowFolio starting in DEBUG mode");
            tracing::info!(target: "app", "Industrial-grade features enabled:");
            tracing::info!(target: "app", "  - Circuit breaker pattern");
            tracing::info!(target: "app", "  - Retry with exponential backoff");
            tracing::info!(target: "app", "  - Health monitoring and metrics");
            tracing::info!(target: "app", "  - Multi-tier caching");
            tracing::info!(target: "app", "  - Free-tier optimized providers");
        }
    });
}

/// Log a structured message
pub fn log(level: LogLevel, _module: &str, message: &str) {
    match level {
        LogLevel::Trace => tracing::trace!("{}", message),
        LogLevel::Debug => tracing::debug!("{}", message),
        LogLevel::Info  => tracing::info!("{}", message),
        LogLevel::Warn  => tracing::warn!("{}", message),
        LogLevel::Error => tracing::error!("{}", message),
    }
}

/// Log with context data
pub fn log_with_context(level: LogLevel, _module: &str, message: &str, context: &[(&str, &str)]) {
    let ctx_str: String = context.iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");

    let full_message = if ctx_str.is_empty() {
        message.to_string()
    } else {
        format!("{} | {}", message, ctx_str)
    };

    match level {
        LogLevel::Trace => tracing::trace!("{}", full_message),
        LogLevel::Debug => tracing::debug!("{}", full_message),
        LogLevel::Info  => tracing::info!("{}", full_message),
        LogLevel::Warn  => tracing::warn!("{}", full_message),
        LogLevel::Error => tracing::error!("{}", full_message),
    }
}

// Convenience macros for structured logging

#[macro_export]
macro_rules! log_trace {
    ($module:expr, $($arg:tt)*) => {
        #[cfg(debug_assertions)]
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Trace,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_debug {
    ($module:expr, $($arg:tt)*) => {
        #[cfg(debug_assertions)]
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Debug,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_info {
    ($module:expr, $($arg:tt)*) => {
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Info,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_warn {
    ($module:expr, $($arg:tt)*) => {
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Warn,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_error {
    ($module:expr, $($arg:tt)*) => {
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Error,
            $module,
            &format!($($arg)*)
        );
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_as_str() {
        assert_eq!(LogLevel::Trace.as_str(), "TRACE");
        assert_eq!(LogLevel::Debug.as_str(), "DEBUG");
        assert_eq!(LogLevel::Info.as_str(), "INFO");
        assert_eq!(LogLevel::Warn.as_str(), "WARN");
        assert_eq!(LogLevel::Error.as_str(), "ERROR");
    }

    #[test]
    fn test_init_logging_does_not_panic() {
        init_logging();
        init_logging(); // Second call is a no-op, should not panic
    }

    #[test]
    fn test_log_all_levels() {
        log(LogLevel::Trace, "test_module", "trace message");
        log(LogLevel::Debug, "test_module", "debug message");
        log(LogLevel::Info, "test_module", "info message");
        log(LogLevel::Warn, "test_module", "warn message");
        log(LogLevel::Error, "test_module", "error message");
    }

    #[test]
    fn test_log_with_context_empty() {
        log_with_context(LogLevel::Info, "test_module", "message with no context", &[]);
    }

    #[test]
    fn test_log_with_context_non_empty() {
        log_with_context(
            LogLevel::Warn,
            "test_module",
            "message with context",
            &[("key1", "value1"), ("key2", "value2")],
        );
    }
}
